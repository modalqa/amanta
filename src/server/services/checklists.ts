import "server-only";
import { z } from "zod";
import { ensure, requireUserId, type Ctx } from "../context";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { assertOwned } from "../db/tenant";
import { createDeviationTx } from "./deviations";
import type { Prisma } from "@/generated/prisma/client";
import type { ChecklistItemType, TemplateStatus } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

const numOrNull = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(",", "."))), z.number().finite().nullable());

export const itemSchema = z.object({
  prompt: z.string().trim().min(2).max(300),
  guidance: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable().optional()),
  type: z.enum(["BOOLEAN", "NUMBER", "TEMPERATURE", "TEXT"]),
  required: z.boolean().default(true),
  minValue: numOrNull.optional(),
  maxValue: numOrNull.optional(),
  unit: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(30).nullable().optional()),
  haccpControlId: z.preprocess((v) => (v === "" ? null : v), z.string().max(40).nullable().optional()),
});

export const templateSchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable().optional()),
  category: z.string().trim().max(40).default("OPERATIONAL"),
  frequency: z.string().trim().max(40).default("PER_SHIFT"),
  items: z.array(itemSchema).min(1).max(100),
});

/** Pure evaluation of a single response against an item definition. */
export function evaluateItem(
  item: { type: ChecklistItemType; required: boolean; minValue: number | null; maxValue: number | null; expectedBool: boolean | null },
  r: { valueBool?: boolean | null; valueNumber?: number | null; valueText?: string | null },
): { passed: boolean; missing: boolean } {
  switch (item.type) {
    case "BOOLEAN": {
      if (r.valueBool === null || r.valueBool === undefined) return { passed: !item.required, missing: item.required };
      return { passed: r.valueBool === (item.expectedBool ?? true), missing: false };
    }
    case "NUMBER":
    case "TEMPERATURE": {
      if (r.valueNumber === null || r.valueNumber === undefined || Number.isNaN(r.valueNumber)) return { passed: !item.required, missing: item.required };
      const okMin = item.minValue === null || r.valueNumber >= item.minValue;
      const okMax = item.maxValue === null || r.valueNumber <= item.maxValue;
      return { passed: okMin && okMax, missing: false };
    }
    case "TEXT": {
      const empty = !r.valueText || !r.valueText.trim();
      return { passed: !(empty && item.required), missing: empty && item.required };
    }
  }
}

export async function listTemplates(ctx: Ctx, status?: TemplateStatus) {
  ensure(ctx, "checklists:read");
  return ctx.db.checklistTemplate.findMany({ where: status ? { status } : {}, include: { _count: { select: { items: true, submissions: true } } }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
}

export async function getTemplate(ctx: Ctx, id: string) {
  ensure(ctx, "checklists:read");
  const t = await ctx.db.checklistTemplate.findUnique({ where: { id }, include: { items: { orderBy: { seq: "asc" }, include: { haccpControl: { select: { id: true, ccpCode: true, processStep: true, status: true } } } } } });
  if (!t) throw new AppError("NOT_FOUND", "template_not_found");
  return t;
}

export async function createTemplate(ctx: Ctx, input: z.infer<typeof templateSchema>) {
  ensure(ctx, "checklists:manage");
  const t = templateSchema.parse(input);
  await assertOwned(ctx.db, "HaccpControl", t.items.map((i) => i.haccpControlId));
  for (const it of t.items) if (it.minValue != null && it.maxValue != null && it.minValue > it.maxValue) throw new AppError("VALIDATION", "min_gt_max");
  const tpl = await ctx.db.$transaction(async (tx) => {
    const created = await tx.checklistTemplate.create({ data: { organizationId: ctx.orgId, name: t.name, description: t.description ?? null, category: t.category, frequency: t.frequency, createdById: requireUserId(ctx) } });
    await tx.checklistItem.createMany({ data: t.items.map((it, i) => ({ organizationId: ctx.orgId, templateId: created.id, seq: i + 1, prompt: it.prompt, guidance: it.guidance ?? null, type: it.type, required: it.required, minValue: it.minValue ?? null, maxValue: it.maxValue ?? null, unit: it.unit ?? (it.type === "TEMPERATURE" ? "°C" : null), expectedBool: it.type === "BOOLEAN" ? true : null, haccpControlId: it.haccpControlId ?? null })) });
    return created;
  });
  await writeAudit(ctx.orgId, ctx.actor, { action: "checklist.template_created", entityType: "ChecklistTemplate", entityId: tpl.id, summary: t.name });
  return tpl;
}

/** Replaces items of a DRAFT template (used by the review editor for AI-generated drafts). */
export async function updateDraftTemplate(ctx: Ctx, id: string, input: z.infer<typeof templateSchema>) {
  ensure(ctx, "checklists:manage");
  const existing = await ctx.db.checklistTemplate.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "template_not_found");
  if (existing.status !== "DRAFT") throw new AppError("INVALID_STATE", "template_not_draft");
  const t = templateSchema.parse(input);
  await assertOwned(ctx.db, "HaccpControl", t.items.map((i) => i.haccpControlId));
  await ctx.db.$transaction(async (tx) => {
    await tx.checklistTemplate.update({ where: { id }, data: { name: t.name, description: t.description ?? null, category: t.category, frequency: t.frequency } });
    await tx.checklistItem.deleteMany({ where: { templateId: id } });
    await tx.checklistItem.createMany({ data: t.items.map((it, i) => ({ organizationId: ctx.orgId, templateId: id, seq: i + 1, prompt: it.prompt, guidance: it.guidance ?? null, type: it.type, required: it.required, minValue: it.minValue ?? null, maxValue: it.maxValue ?? null, unit: it.unit ?? (it.type === "TEMPERATURE" ? "°C" : null), expectedBool: it.type === "BOOLEAN" ? true : null, haccpControlId: it.haccpControlId ?? null })) });
  });
  await writeAudit(ctx.orgId, ctx.actor, { action: "checklist.template_edited", entityType: "ChecklistTemplate", entityId: id });
}

/** Human approval: DRAFT → ACTIVE. Linked HACCP controls must be APPROVED first. */
export async function activateTemplate(ctx: Ctx, id: string) {
  ensure(ctx, "checklists:manage");
  const t = await getTemplate(ctx, id);
  if (t.status !== "DRAFT") throw new AppError("INVALID_STATE", "template_not_draft");
  const unapproved = t.items.filter((i) => i.haccpControl && i.haccpControl.status !== "APPROVED");
  if (unapproved.length) throw new AppError("INVALID_STATE", "linked_controls_not_approved", { items: unapproved.map((i) => i.seq) });
  await ctx.db.checklistTemplate.update({ where: { id }, data: { status: "ACTIVE", approvedById: requireUserId(ctx), approvedAt: new Date() } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "checklist.template_activated", entityType: "ChecklistTemplate", entityId: id, summary: t.name, metadata: { source: t.source, items: t.items.length } });
}

export async function archiveTemplate(ctx: Ctx, id: string) {
  ensure(ctx, "checklists:manage");
  await getTemplate(ctx, id);
  await ctx.db.checklistTemplate.update({ where: { id }, data: { status: "ARCHIVED" } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "checklist.template_archived", entityType: "ChecklistTemplate", entityId: id });
}

export const submissionSchema = z.object({
  templateId: z.string().min(1).max(40),
  batchId: z.preprocess((v) => (v === "" ? null : v), z.string().max(40).nullable().optional()),
  shift: z.preprocess((v) => (v === "" ? null : v), z.string().max(40).nullable().optional()),
  line: z.preprocess((v) => (v === "" ? null : v), z.string().max(60).nullable().optional()),
  notes: z.preprocess((v) => (v === "" ? null : v), z.string().max(2000).nullable().optional()),
  responses: z.array(z.object({
    itemId: z.string().min(1).max(40),
    valueBool: z.boolean().nullable().optional(),
    valueNumber: z.number().finite().nullable().optional(),
    valueText: z.string().max(2000).nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
  })).max(200),
});

/**
 * Records a completed checklist. Numeric/temperature items linked to a CCP also create
 * CcpRecords. Any failed item opens ONE deviation for the submission (HIGH if a CCP failed).
 */
export async function submitChecklist(ctx: Ctx, input: z.infer<typeof submissionSchema>) {
  ensure(ctx, "checklists:submit");
  const s = submissionSchema.parse(input);
  const tpl = await getTemplate(ctx, s.templateId);
  if (tpl.status !== "ACTIVE") throw new AppError("INVALID_STATE", "template_not_active");
  await assertOwned(ctx.db, "Batch", [s.batchId]);
  const byId = new Map(s.responses.map((r) => [r.itemId, r]));
  for (const r of s.responses) if (!tpl.items.some((i) => i.id === r.itemId)) throw new AppError("VALIDATION", "unknown_item");
  const evaluated = tpl.items.map((item) => {
    const r: { valueBool?: boolean | null; valueNumber?: number | null; valueText?: string | null; note?: string | null } = byId.get(item.id) ?? {};
    return { item, r, ...evaluateItem(item, r) };
  });
  const missing = evaluated.filter((e) => e.missing);
  if (missing.length) throw new AppError("VALIDATION", "required_items_missing", { items: missing.map((m) => m.item.seq) });
  const failed = evaluated.filter((e) => !e.passed);
  const userId = requireUserId(ctx);

  return ctx.db.$transaction(async (t) => {
    const tx = t as unknown as Tx;
    const sub = await tx.checklistSubmission.create({
      data: { organizationId: ctx.orgId, templateId: tpl.id, submittedById: userId, batchId: s.batchId ?? null, shift: s.shift ?? null, line: s.line ?? null, notes: s.notes ?? null, status: failed.length ? "FAILED" : "PASSED", failedCount: failed.length },
    });
    await tx.checklistResponse.createMany({
      data: evaluated.map((e) => ({ organizationId: ctx.orgId, submissionId: sub.id, itemId: e.item.id, valueBool: e.r.valueBool ?? null, valueNumber: e.r.valueNumber ?? null, valueText: e.r.valueText ?? null, note: e.r.note ?? null, passed: e.passed })),
    });
    let ccpFailed: { controlId: string; recordId: string } | null = null;
    for (const e of evaluated) {
      if (!e.item.haccpControl || e.item.haccpControl.status !== "APPROVED") continue;
      if ((e.item.type === "NUMBER" || e.item.type === "TEMPERATURE") && e.r.valueNumber != null) {
        const rec = await tx.ccpRecord.create({ data: { organizationId: ctx.orgId, haccpControlId: e.item.haccpControl.id, value: e.r.valueNumber, unit: e.item.unit, withinLimits: e.passed, recordedById: userId, source: "CHECKLIST", batchId: s.batchId ?? null, submissionId: sub.id } });
        if (!e.passed && !ccpFailed) ccpFailed = { controlId: e.item.haccpControl.id, recordId: rec.id };
      } else if (e.item.type === "BOOLEAN" && !e.passed && !ccpFailed) {
        ccpFailed = { controlId: e.item.haccpControl.id, recordId: "" };
      }
    }
    let deviationId: string | null = null;
    if (failed.length) {
      const lines = failed.map((f) => `#${f.item.seq} ${f.item.prompt}: ${f.r.valueNumber ?? (f.r.valueBool === undefined || f.r.valueBool === null ? "-" : f.r.valueBool ? "Ya" : "Tidak")}${f.item.unit ? " " + f.item.unit : ""}${f.item.minValue != null || f.item.maxValue != null ? ` (batas ${f.item.minValue ?? "–"}…${f.item.maxValue ?? "–"})` : ""}`);
      const dev = await createDeviationTx(tx, ctx, {
        title: `${tpl.name}: ${failed.length} item tidak sesuai`,
        description: lines.join("\n"),
        severity: ccpFailed ? "HIGH" : "MEDIUM",
        source: ccpFailed ? "CCP" : "CHECKLIST",
        haccpControlId: ccpFailed?.controlId ?? null,
        ccpRecordId: ccpFailed?.recordId || null,
        submissionId: sub.id,
        batchId: s.batchId ?? null,
      });
      deviationId = dev.id;
    }
    await writeAudit(ctx.orgId, ctx.actor, { action: "checklist.submitted", entityType: "ChecklistSubmission", entityId: sub.id, summary: `${tpl.name}: ${failed.length ? "FAILED" : "PASSED"}`, metadata: { failed: failed.length, deviationId } }, tx);
    return { submission: sub, deviationId };
  });
}

export async function listSubmissions(ctx: Ctx, filter: { templateId?: string; since?: Date } = {}) {
  ensure(ctx, "checklists:read");
  return ctx.db.checklistSubmission.findMany({
    where: { ...(filter.templateId ? { templateId: filter.templateId } : {}), ...(filter.since ? { submittedAt: { gte: filter.since } } : {}) },
    include: { template: { select: { name: true } }, batch: { select: { batchNumber: true } }, deviations: { select: { id: true, code: true } } },
    orderBy: { submittedAt: "desc" },
    take: 200,
  });
}

export async function getSubmission(ctx: Ctx, id: string) {
  ensure(ctx, "checklists:read");
  const s = await ctx.db.checklistSubmission.findUnique({ where: { id }, include: { template: true, batch: true, responses: { include: { item: true }, orderBy: { item: { seq: "asc" } } }, deviations: { select: { id: true, code: true, status: true } } } });
  if (!s) throw new AppError("NOT_FOUND", "submission_not_found");
  return s;
}
