import "server-only";
import { prisma } from "../db/client";
import { tenantDb } from "../db/tenant";
import { storage } from "../storage";
import { extractText } from "../extract/text";
import { validateUpload } from "../extract/filetype";
import { getAiProvider } from "../ai";
import { AppError } from "../errors";
import { env } from "../env";
import { writeAudit } from "../audit";
import { capaDraftSchema, capaPrompts, checklistDraftSchema, checklistPrompts, haccpDraftSchema, haccpPrompts, type ChecklistDraft, type HaccpDraft } from "../ai/prompts";
import type { Prisma } from "@/generated/prisma/client";
import { runDailyAlerts } from "../services/alerts";

const SYSTEM_ACTOR = { userId: null, apiKeyId: null, ip: "worker" };

export async function handleExtractDocument({ orgId, documentId }: { orgId: string; documentId: string }) {
  const db = tenantDb(orgId);
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) return;
  await db.document.update({ where: { id: documentId }, data: { status: "PROCESSING" } });
  try {
    const bytes = await storage().get(doc.storageKey);
    const vf = await validateUpload(bytes, doc.originalName, Number.MAX_SAFE_INTEGER);
    const res = await extractText(bytes, vf.kind);
    const failed = !res.text.trim();
    await db.document.update({
      where: { id: documentId },
      data: {
        status: failed ? "FAILED" : "EXTRACTED",
        extractedText: res.text || null,
        pageCount: res.pageCount ?? null,
        extractionError: failed ? res.warnings[0] ?? "no_text_found" : res.warnings.join(",") || null,
      },
    });
    await writeAudit(orgId, SYSTEM_ACTOR, { action: failed ? "document.extraction_failed" : "document.extracted", entityType: "Document", entityId: documentId, metadata: { chars: res.text.length, warnings: res.warnings } });
  } catch (e) {
    await db.document.update({ where: { id: documentId }, data: { status: "FAILED", extractionError: (e as Error).message.slice(0, 300) } });
    throw e;
  }
}

async function startRun(orgId: string, aiRunId: string) {
  const db = tenantDb(orgId);
  const run = await db.aiRun.findUnique({ where: { id: aiRunId }, include: { document: true, deviation: { include: { haccpControl: true } } } });
  if (!run || run.status === "SUCCEEDED") return null;
  await db.aiRun.update({ where: { id: aiRunId }, data: { status: "RUNNING", startedAt: new Date() } });
  return { db, run };
}

async function failRun(orgId: string, aiRunId: string, e: unknown) {
  const err = e instanceof AppError ? e : new AppError("AI_FAILED", (e as Error).message ?? "unknown");
  await tenantDb(orgId).aiRun.update({
    where: { id: aiRunId },
    data: { status: "FAILED", errorCode: err.code, errorMessage: `${err.message}${err.details ? " " + JSON.stringify(err.details).slice(0, 800) : ""}`, finishedAt: new Date() },
  });
  await writeAudit(orgId, SYSTEM_ACTOR, { action: "ai.failed", entityType: "AiRun", entityId: aiRunId, metadata: { code: err.code, message: err.message } });
}

function docInput(doc: { title: string; category: string; extractedText: string | null }) {
  const max = env().AI_MAX_INPUT_CHARS;
  const text = doc.extractedText ?? "";
  return { title: doc.title, category: doc.category, text: text.length > max ? text.slice(0, max) + "\n[...truncated...]" : text };
}

const toC = (v: number | undefined) => (v === undefined ? null : v);

/** Persists AI HACCP output as DRAFT controls + a DRAFT checklist. Nothing becomes active without approval. */
export async function persistHaccpDraft(orgId: string, aiRunId: string, requestedById: string, documentId: string | null, draft: HaccpDraft) {
  const db = tenantDb(orgId);
  return db.$transaction(async (t) => {
    const tx = t as unknown as Prisma.TransactionClient;
    const productIds = new Map<string, string>();
    for (const p of draft.products) {
      const existing = await tx.product.findFirst({ where: { name: p.name } });
      const prod = existing ?? (await tx.product.create({ data: { organizationId: orgId, name: p.name, description: p.description ?? null } }));
      productIds.set(p.name.toLowerCase(), prod.id);
    }
    const controlIdsByStep = new Map<string, string>();
    let ccpN = await tx.haccpControl.count({ where: { isCcp: true } });
    for (const c of draft.controls) {
      const productId = c.productName ? productIds.get(c.productName.toLowerCase()) ?? null : null;
      const control = await tx.haccpControl.create({
        data: {
          organizationId: orgId, productId, documentId, aiRunId, processStep: c.processStep, hazardType: c.hazardType,
          hazardDescription: c.hazardDescription, severity: c.severity, likelihood: c.likelihood, riskScore: c.severity * c.likelihood,
          isCcp: c.isCcp, ccpCode: c.isCcp ? `CCP-${++ccpN}` : null, justification: c.justification ?? null,
          controlMeasure: c.controlMeasure, criticalLimitMin: toC(c.criticalLimitMin), criticalLimitMax: toC(c.criticalLimitMax),
          limitUnit: c.limitUnit ?? null, criticalLimitText: c.criticalLimitText ?? null, monitoringProcedure: c.monitoringProcedure,
          monitoringFrequency: c.monitoringFrequency, correctiveAction: c.correctiveAction, verificationProcedure: c.verificationProcedure ?? null,
          records: c.records ?? null, status: "DRAFT", source: "AI", createdById: requestedById,
        },
      });
      if (c.isCcp) controlIdsByStep.set(c.processStep.toLowerCase(), control.id);
    }
    let templateId: string | null = null;
    if (draft.checklist) templateId = await createChecklistDraft(tx, orgId, aiRunId, requestedById, draft.checklist, controlIdsByStep);
    return { controls: draft.controls.length, templateId };
  });
}

async function createChecklistDraft(
  tx: Prisma.TransactionClient, orgId: string, aiRunId: string, requestedById: string,
  cl: Pick<ChecklistDraft, "name" | "items"> & { description?: string; frequency?: string }, controlIdsByStep: Map<string, string>,
) {
  const t = await tx.checklistTemplate.create({
    data: { organizationId: orgId, name: cl.name, description: cl.description ?? null, frequency: cl.frequency ?? "PER_SHIFT", status: "DRAFT", source: "AI", aiRunId, createdById: requestedById },
  });
  await tx.checklistItem.createMany({
    data: cl.items.map((it, i) => ({
      organizationId: orgId, templateId: t.id, seq: i + 1, prompt: it.prompt, guidance: it.guidance ?? null, type: it.type,
      minValue: toC(it.minValue), maxValue: toC(it.maxValue), unit: it.unit ?? (it.type === "TEMPERATURE" ? "°C" : null),
      expectedBool: it.type === "BOOLEAN" ? true : null,
      haccpControlId: "ccpProcessStep" in it && it.ccpProcessStep ? controlIdsByStep.get(it.ccpProcessStep.toLowerCase()) ?? null : null,
    })),
  });
  return t.id;
}

export async function handleAiHaccp({ orgId, aiRunId }: { orgId: string; aiRunId: string }) {
  const started = await startRun(orgId, aiRunId);
  if (!started) return;
  const { db, run } = started;
  try {
    if (!run.document?.extractedText) throw new AppError("INVALID_STATE", "document_not_extracted");
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const provider = await getAiProvider(orgId);
    const { system, prompt } = haccpPrompts(docInput(run.document), org.locale, org.temperatureUnit);
    const res = await provider.generateJson({ system, prompt, schema: haccpDraftSchema, maxTokens: 12000 });
    const saved = await persistHaccpDraft(orgId, aiRunId, run.requestedById, run.documentId, res.data);
    await db.aiRun.update({
      where: { id: aiRunId },
      data: { status: "SUCCEEDED", provider: res.provider, model: res.model, inputTokens: res.inputTokens ?? null, outputTokens: res.outputTokens ?? null, output: JSON.parse(JSON.stringify({ summary: res.data.summary ?? null, warnings: res.data.warnings, ...saved })), finishedAt: new Date() },
    });
    await writeAudit(orgId, SYSTEM_ACTOR, { action: "ai.haccp_drafted", entityType: "AiRun", entityId: aiRunId, summary: `${saved.controls} draft controls`, metadata: { provider: res.provider, model: res.model, documentId: run.documentId } });
  } catch (e) {
    await failRun(orgId, aiRunId, e);
  }
}

export async function handleAiChecklist({ orgId, aiRunId }: { orgId: string; aiRunId: string }) {
  const started = await startRun(orgId, aiRunId);
  if (!started) return;
  const { db, run } = started;
  try {
    if (!run.document?.extractedText) throw new AppError("INVALID_STATE", "document_not_extracted");
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const provider = await getAiProvider(orgId);
    const { system, prompt } = checklistPrompts(docInput(run.document), org.locale);
    const res = await provider.generateJson({ system, prompt, schema: checklistDraftSchema, maxTokens: 6000 });
    const templateId = await db.$transaction((tx) => createChecklistDraft(tx as unknown as Prisma.TransactionClient, orgId, aiRunId, run.requestedById, res.data, new Map()));
    await db.aiRun.update({ where: { id: aiRunId }, data: { status: "SUCCEEDED", provider: res.provider, model: res.model, inputTokens: res.inputTokens ?? null, outputTokens: res.outputTokens ?? null, output: { templateId, warnings: res.data.warnings }, finishedAt: new Date() } });
    await writeAudit(orgId, SYSTEM_ACTOR, { action: "ai.checklist_drafted", entityType: "ChecklistTemplate", entityId: templateId, metadata: { provider: res.provider, model: res.model } });
  } catch (e) {
    await failRun(orgId, aiRunId, e);
  }
}

export async function handleAiCapa({ orgId, aiRunId }: { orgId: string; aiRunId: string }) {
  const started = await startRun(orgId, aiRunId);
  if (!started) return;
  const { db, run } = started;
  try {
    const dev = run.deviation;
    if (!dev) throw new AppError("NOT_FOUND", "deviation_not_found");
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const recentSimilar = dev.haccpControlId ? await db.deviation.count({ where: { haccpControlId: dev.haccpControlId, createdAt: { gte: new Date(Date.now() - 90 * 86400000) } } }) : 0;
    const provider = await getAiProvider(orgId);
    const { system, prompt } = capaPrompts({
      code: dev.code, title: dev.title, description: dev.description, severity: dev.severity, source: dev.source, immediateAction: dev.immediateAction,
      control: dev.haccpControl ? { processStep: dev.haccpControl.processStep, hazardDescription: dev.haccpControl.hazardDescription, criticalLimitText: dev.haccpControl.criticalLimitText, correctiveAction: dev.haccpControl.correctiveAction } : null,
      recentSimilar,
    }, org.locale);
    const res = await provider.generateJson({ system, prompt, schema: capaDraftSchema, maxTokens: 4000 });
    // The suggestion is stored on the run; a QA user turns it into CAPA records explicitly.
    await db.aiRun.update({ where: { id: aiRunId }, data: { status: "SUCCEEDED", provider: res.provider, model: res.model, inputTokens: res.inputTokens ?? null, outputTokens: res.outputTokens ?? null, output: JSON.parse(JSON.stringify(res.data)), finishedAt: new Date() } });
    await writeAudit(orgId, SYSTEM_ACTOR, { action: "ai.capa_drafted", entityType: "Deviation", entityId: dev.id, metadata: { aiRunId, provider: res.provider, model: res.model } });
  } catch (e) {
    await failRun(orgId, aiRunId, e);
  }
}

export async function handleDailyAlerts() {
  return runDailyAlerts(new Date());
}

export const HANDLERS = {
  "document-extract": handleExtractDocument,
  "ai-haccp-from-document": handleAiHaccp,
  "ai-checklist-from-document": handleAiChecklist,
  "ai-capa-draft": handleAiCapa,
  "daily-alerts": handleDailyAlerts,
} as const;
