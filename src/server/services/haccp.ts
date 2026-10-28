import "server-only";
import { z } from "zod";
import { ensure, requireUserId, type Ctx } from "../context";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { assertOwned } from "../db/tenant";
import type { ControlStatus } from "@/generated/prisma/enums";

const optNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(",", "."))), z.number().finite().nullable());
const optText = (max: number) => z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(max).nullable());

export const controlSchema = z.object({
  productId: optText(40),
  processStep: z.string().trim().min(2).max(200),
  hazardType: z.enum(["BIOLOGICAL", "CHEMICAL", "PHYSICAL", "ALLERGEN", "HALAL"]),
  hazardDescription: z.string().trim().min(3).max(1000),
  severity: z.coerce.number().int().min(1).max(5),
  likelihood: z.coerce.number().int().min(1).max(5),
  isCcp: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  ccpCode: optText(20),
  justification: optText(1000),
  controlMeasure: z.string().trim().min(3).max(1000),
  criticalLimitMin: optNum,
  criticalLimitMax: optNum,
  limitUnit: optText(30),
  criticalLimitText: optText(500),
  monitoringProcedure: z.string().trim().min(3).max(1000),
  monitoringFrequency: z.string().trim().min(2).max(200),
  correctiveAction: z.string().trim().min(3).max(1000),
  verificationProcedure: optText(1000),
  records: optText(500),
});
export type ControlInput = z.infer<typeof controlSchema>;

function validateLimits(c: ControlInput) {
  if (c.criticalLimitMin !== null && c.criticalLimitMax !== null && c.criticalLimitMin > c.criticalLimitMax) {
    throw new AppError("VALIDATION", "critical_limit_min_gt_max");
  }
}

export async function listControls(ctx: Ctx, filter: { status?: ControlStatus; documentId?: string } = {}) {
  ensure(ctx, "haccp:read");
  return ctx.db.haccpControl.findMany({
    where: { ...(filter.status ? { status: filter.status } : {}), ...(filter.documentId ? { documentId: filter.documentId } : {}) },
    include: { product: { select: { name: true } }, document: { select: { id: true, title: true } } },
    orderBy: [{ status: "asc" }, { isCcp: "desc" }, { riskScore: "desc" }, { createdAt: "asc" }],
    take: 500,
  });
}

export async function getControl(ctx: Ctx, id: string) {
  ensure(ctx, "haccp:read");
  const c = await ctx.db.haccpControl.findUnique({ where: { id }, include: { product: true, document: { select: { id: true, title: true } }, aiRun: { select: { id: true, provider: true, model: true } } } });
  if (!c) throw new AppError("NOT_FOUND", "control_not_found");
  return c;
}

export async function createControl(ctx: Ctx, input: ControlInput) {
  ensure(ctx, "haccp:write");
  const c = controlSchema.parse(input);
  validateLimits(c);
  await assertOwned(ctx.db, "Product", [c.productId]);
  const ccpCode = c.isCcp ? c.ccpCode ?? `CCP-${(await ctx.db.haccpControl.count({ where: { isCcp: true } })) + 1}` : null;
  const control = await ctx.db.haccpControl.create({
    data: { ...c, ccpCode, organizationId: ctx.orgId, riskScore: c.severity * c.likelihood, status: "DRAFT", source: "MANUAL", createdById: requireUserId(ctx) },
  });
  await writeAudit(ctx.orgId, ctx.actor, { action: "haccp.control_created", entityType: "HaccpControl", entityId: control.id, summary: `${c.processStep}: ${c.hazardDescription.slice(0, 80)}` });
  return control;
}

/** Edits are only allowed on DRAFT/REJECTED controls. Approved controls must be retired and re-created (versioned). */
export async function updateControl(ctx: Ctx, id: string, input: ControlInput) {
  ensure(ctx, "haccp:write");
  const existing = await ctx.db.haccpControl.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "control_not_found");
  if (existing.status === "APPROVED" || existing.status === "RETIRED") throw new AppError("INVALID_STATE", "control_locked");
  const c = controlSchema.parse(input);
  validateLimits(c);
  await assertOwned(ctx.db, "Product", [c.productId]);
  const updated = await ctx.db.haccpControl.update({
    where: { id },
    data: { ...c, ccpCode: c.isCcp ? c.ccpCode ?? existing.ccpCode : null, riskScore: c.severity * c.likelihood, status: "DRAFT", reviewNote: null },
  });
  await writeAudit(ctx.orgId, ctx.actor, { action: "haccp.control_edited", entityType: "HaccpControl", entityId: id, metadata: diff(existing as unknown as Record<string, unknown>, c as unknown as Record<string, unknown>) });
  return updated;
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) if (before[k] !== after[k] && !(before[k] == null && after[k] == null)) changes[k] = { from: before[k], to: after[k] };
  return changes;
}

/**
 * Human review gate. A CCP can only be approved when it has a measurable critical limit
 * (min/max) or an explicit textual limit, plus monitoring and corrective action.
 */
export async function reviewControl(ctx: Ctx, id: string, decision: "APPROVE" | "REJECT", note?: string) {
  ensure(ctx, "haccp:approve");
  const userId = requireUserId(ctx);
  const c = await ctx.db.haccpControl.findUnique({ where: { id } });
  if (!c) throw new AppError("NOT_FOUND", "control_not_found");
  if (c.status !== "DRAFT") throw new AppError("INVALID_STATE", "control_not_draft");
  if (decision === "REJECT" && !note?.trim()) throw new AppError("VALIDATION", "review_note_required");
  if (decision === "APPROVE" && c.isCcp && c.criticalLimitMin === null && c.criticalLimitMax === null && !c.criticalLimitText) {
    throw new AppError("VALIDATION", "ccp_requires_critical_limit");
  }
  const updated = await ctx.db.haccpControl.update({
    where: { id },
    data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewedById: userId, reviewedAt: new Date(), reviewNote: note?.trim().slice(0, 1000) || null },
  });
  await writeAudit(ctx.orgId, ctx.actor, { action: decision === "APPROVE" ? "haccp.control_approved" : "haccp.control_rejected", entityType: "HaccpControl", entityId: id, summary: `${c.ccpCode ?? c.processStep} (${c.source})`, metadata: { note: note ?? null, source: c.source } });
  return updated;
}

export async function bulkApprove(ctx: Ctx, ids: string[], note?: string) {
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids.slice(0, 200)) {
    try { await reviewControl(ctx, id, "APPROVE", note); results.push({ id, ok: true }); }
    catch (e) { results.push({ id, ok: false, error: (e as Error).message }); }
  }
  return results;
}

export async function retireControl(ctx: Ctx, id: string, reason: string) {
  ensure(ctx, "haccp:approve");
  const c = await ctx.db.haccpControl.findUnique({ where: { id } });
  if (!c) throw new AppError("NOT_FOUND", "control_not_found");
  if (c.status !== "APPROVED") throw new AppError("INVALID_STATE", "control_not_approved");
  if (!reason.trim()) throw new AppError("VALIDATION", "reason_required");
  await ctx.db.haccpControl.update({ where: { id }, data: { status: "RETIRED", reviewNote: reason.slice(0, 1000) } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "haccp.control_retired", entityType: "HaccpControl", entityId: id, metadata: { reason } });
}

/** Creates a new DRAFT version from an approved/retired control for re-approval. */
export async function reviseControl(ctx: Ctx, id: string) {
  ensure(ctx, "haccp:write");
  const c = await ctx.db.haccpControl.findUnique({ where: { id } });
  if (!c) throw new AppError("NOT_FOUND", "control_not_found");
  const { id: _id, createdAt: _c, updatedAt: _u, reviewedAt: _r, reviewedById: _rb, reviewNote: _rn, status: _s, ...rest } = c;
  void _id; void _c; void _u; void _r; void _rb; void _rn; void _s;
  const draft = await ctx.db.haccpControl.create({ data: { ...rest, status: "DRAFT", source: "MANUAL", createdById: requireUserId(ctx), version: c.version + 1 } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "haccp.control_revised", entityType: "HaccpControl", entityId: draft.id, metadata: { from: id, version: draft.version } });
  return draft;
}

export async function listApprovedCcps(ctx: Ctx) {
  return ctx.db.haccpControl.findMany({ where: { status: "APPROVED", isCcp: true }, orderBy: { ccpCode: "asc" } });
}

/**
 * Deterministic checklist generation from APPROVED CCPs: one measurement item per CCP
 * using its critical limits. The result is a DRAFT template that still needs activation.
 */
export async function generateChecklistFromCcps(ctx: Ctx, name: string) {
  ensure(ctx, "checklists:manage");
  const ccps = await listApprovedCcps(ctx);
  if (ccps.length === 0) throw new AppError("INVALID_STATE", "no_approved_ccps");
  const userId = requireUserId(ctx);
  const template = await ctx.db.$transaction(async (tx) => {
    const t = await tx.checklistTemplate.create({ data: { organizationId: ctx.orgId, name: name.trim().slice(0, 150) || "Monitoring CCP", category: "CCP_MONITORING", frequency: "PER_SHIFT", status: "DRAFT", source: "MANUAL", createdById: userId } });
    await tx.checklistItem.createMany({
      data: ccps.map((c, i) => {
        const isTemp = /°\s*[cf]\b|celsius|^\s*[cf]\s*$/i.test(c.limitUnit ?? "");
        const measurable = c.criticalLimitMin !== null || c.criticalLimitMax !== null;
        return {
          organizationId: ctx.orgId, templateId: t.id, seq: i + 1,
          prompt: `${c.ccpCode ?? "CCP"} – ${c.processStep}: ${measurable ? (isTemp ? "catat suhu" : "catat nilai") : "batas kritis terpenuhi?"}`,
          guidance: `${c.monitoringProcedure}${c.criticalLimitText ? ` | Batas kritis: ${c.criticalLimitText}` : ""}`.slice(0, 500),
          type: measurable ? (isTemp ? "TEMPERATURE" : "NUMBER") : "BOOLEAN",
          minValue: c.criticalLimitMin, maxValue: c.criticalLimitMax, unit: c.limitUnit, expectedBool: measurable ? null : true,
          haccpControlId: c.id, required: true,
        } as const;
      }),
    });
    return t;
  });
  await writeAudit(ctx.orgId, ctx.actor, { action: "checklist.generated_from_ccps", entityType: "ChecklistTemplate", entityId: template.id, metadata: { ccps: ccps.length } });
  return template;
}

export async function listProducts(ctx: Ctx) {
  return ctx.db.product.findMany({ orderBy: { name: "asc" } });
}

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: optText(40),
  description: optText(500),
  shelfLifeDays: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(3650).nullable()),
  halalCertified: z.preprocess((v) => v === true || v === "on", z.boolean()),
  bpomNumber: optText(40),
});

export async function createProduct(ctx: Ctx, input: z.infer<typeof productSchema>) {
  ensure(ctx, "haccp:write");
  const p = productSchema.parse(input);
  if (await ctx.db.product.findFirst({ where: { name: p.name } })) throw new AppError("CONFLICT", "product_exists");
  const prod = await ctx.db.product.create({ data: { ...p, organizationId: ctx.orgId } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "product.created", entityType: "Product", entityId: prod.id, summary: p.name });
  return prod;
}
