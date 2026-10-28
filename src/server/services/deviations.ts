import "server-only";
import { z } from "zod";
import { ensure, requireUserId, type Ctx } from "../context";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { assertOwned, type TenantDb } from "../db/tenant";
import { nextCode } from "../counters";
import { enqueue, QUEUES } from "../jobs/queue";
import { rateLimit } from "../ratelimit";
import type { Prisma } from "@/generated/prisma/client";
import type { DeviationSource, DeviationStatus, Disposition, Severity } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export type NewDeviation = {
  title: string; description: string; severity: Severity; source: DeviationSource; occurredAt?: Date;
  immediateAction?: string | null; haccpControlId?: string | null; ccpRecordId?: string | null;
  submissionId?: string | null; batchId?: string | null; supplierId?: string | null;
};

/** Creates a deviation inside an existing transaction, notifying QA. Used by CCP/checklist automation too. */
export async function createDeviationTx(tx: Tx, ctx: Ctx, d: NewDeviation) {
  const code = await nextCode(tx, ctx.orgId, "DEV");
  const dev = await tx.deviation.create({
    data: {
      organizationId: ctx.orgId, code, title: d.title.slice(0, 200), description: d.description.slice(0, 4000), severity: d.severity, source: d.source,
      occurredAt: d.occurredAt ?? new Date(), immediateAction: d.immediateAction ?? null, reportedById: ctx.userId,
      haccpControlId: d.haccpControlId ?? null, ccpRecordId: d.ccpRecordId ?? null, submissionId: d.submissionId ?? null,
      batchId: d.batchId ?? null, supplierId: d.supplierId ?? null,
      // A deviation on a batch automatically puts product disposition on HOLD until QA decides.
      disposition: d.batchId ? "HOLD" : "PENDING",
    },
  });
  if (d.batchId) await tx.batch.updateMany({ where: { id: d.batchId, organizationId: ctx.orgId, status: { in: ["IN_PRODUCTION", "RELEASED"] } }, data: { status: "ON_HOLD" } });
  await tx.notification.create({
    data: { organizationId: ctx.orgId, type: "DEVIATION_OPENED", title: `${code}: ${d.title.slice(0, 120)}`, body: `Severity ${d.severity}`, link: `/app/deviations/${dev.id}` },
  });
  await writeAudit(ctx.orgId, ctx.actor, { action: "deviation.opened", entityType: "Deviation", entityId: dev.id, summary: `${code} ${d.title.slice(0, 100)}`, metadata: { severity: d.severity, source: d.source, batchId: d.batchId ?? null } }, tx);
  return dev;
}

const optId = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().max(40).nullable());
export const deviationSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(4000),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  source: z.enum(["CCP", "CHECKLIST", "MANUAL", "SUPPLIER", "CUSTOMER_COMPLAINT", "AUDIT"]).default("MANUAL"),
  occurredAt: z.preprocess((v) => (v ? new Date(String(v)) : undefined), z.date().optional()),
  immediateAction: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(2000).nullable().optional()),
  haccpControlId: optId.optional(),
  batchId: optId.optional(),
  supplierId: optId.optional(),
});

export async function reportDeviation(ctx: Ctx, input: z.infer<typeof deviationSchema>) {
  ensure(ctx, "deviations:create");
  const d = deviationSchema.parse(input);
  await assertOwned(ctx.db, "HaccpControl", [d.haccpControlId]);
  await assertOwned(ctx.db, "Batch", [d.batchId]);
  await assertOwned(ctx.db, "Supplier", [d.supplierId]);
  return ctx.db.$transaction((tx) => createDeviationTx(tx as unknown as Tx, ctx, d));
}

export async function listDeviations(ctx: Ctx, filter: { status?: DeviationStatus; severity?: Severity; open?: boolean } = {}) {
  ensure(ctx, "deviations:read");
  return ctx.db.deviation.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.severity ? { severity: filter.severity } : {}),
      ...(filter.open ? { status: { not: "CLOSED" } } : {}),
    },
    include: { batch: { select: { batchNumber: true } }, haccpControl: { select: { ccpCode: true, processStep: true } }, _count: { select: { capas: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });
}

export async function getDeviation(ctx: Ctx, id: string) {
  ensure(ctx, "deviations:read");
  const d = await ctx.db.deviation.findUnique({
    where: { id },
    include: {
      capas: { orderBy: { createdAt: "asc" } },
      batch: { select: { id: true, batchNumber: true, status: true } },
      supplier: { select: { id: true, name: true } },
      haccpControl: { select: { id: true, ccpCode: true, processStep: true, criticalLimitMin: true, criticalLimitMax: true, limitUnit: true, correctiveAction: true } },
      ccpRecord: true,
      submission: { select: { id: true, template: { select: { name: true } }, submittedAt: true } },
      aiRuns: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });
  if (!d) throw new AppError("NOT_FOUND", "deviation_not_found");
  return d;
}

export const investigationSchema = z.object({
  rootCause: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(4000).nullable()),
  immediateAction: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(2000).nullable()),
  disposition: z.enum(["PENDING", "HOLD", "RELEASE", "REWORK", "DESTROY"]),
});

export async function updateInvestigation(ctx: Ctx, id: string, input: z.infer<typeof investigationSchema>) {
  ensure(ctx, "deviations:manage");
  const d = await ctx.db.deviation.findUnique({ where: { id } });
  if (!d) throw new AppError("NOT_FOUND", "deviation_not_found");
  if (d.status === "CLOSED") throw new AppError("INVALID_STATE", "deviation_closed");
  const data = investigationSchema.parse(input);
  if (data.disposition !== d.disposition && (data.disposition === "RELEASE" || data.disposition === "DESTROY") && !ctx.permissions.has("deviations:close")) {
    throw new AppError("FORBIDDEN", "disposition_requires_qa");
  }
  const updated = await ctx.db.$transaction(async (tx) => {
    const u = await tx.deviation.update({ where: { id }, data: { ...data, status: d.status === "OPEN" ? "INVESTIGATING" : d.status } });
    if (d.batchId && data.disposition !== d.disposition) {
      const batchStatus = data.disposition === "RELEASE" ? "RELEASED" : data.disposition === "DESTROY" ? "REJECTED" : data.disposition === "HOLD" ? "ON_HOLD" : null;
      if (batchStatus) await tx.batch.update({ where: { id: d.batchId }, data: { status: batchStatus } });
    }
    await writeAudit(ctx.orgId, ctx.actor, { action: "deviation.investigation_updated", entityType: "Deviation", entityId: id, metadata: { disposition: { from: d.disposition, to: data.disposition }, rootCauseSet: !!data.rootCause } }, tx as unknown as Tx);
    return u;
  });
  return updated;
}

export async function requestCapaDraft(ctx: Ctx, deviationId: string) {
  ensure(ctx, "ai:run");
  await rateLimit(`ai:${ctx.orgId}`, 30, 3600);
  const d = await ctx.db.deviation.findUnique({ where: { id: deviationId }, select: { id: true, status: true } });
  if (!d) throw new AppError("NOT_FOUND", "deviation_not_found");
  if (d.status === "CLOSED") throw new AppError("INVALID_STATE", "deviation_closed");
  const run = await ctx.db.aiRun.create({ data: { organizationId: ctx.orgId, kind: "CAPA_DRAFT", deviationId, requestedById: requireUserId(ctx) } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "ai.requested", entityType: "AiRun", entityId: run.id, metadata: { kind: "CAPA_DRAFT", deviationId } });
  await enqueue(QUEUES.aiCapa, { orgId: ctx.orgId, aiRunId: run.id });
  return run;
}

export async function closeDeviation(ctx: Ctx, id: string, closureNote: string) {
  ensure(ctx, "deviations:close");
  const d = await ctx.db.deviation.findUnique({ where: { id }, include: { capas: true } });
  if (!d) throw new AppError("NOT_FOUND", "deviation_not_found");
  if (d.status === "CLOSED") throw new AppError("INVALID_STATE", "deviation_closed");
  if (!closureNote.trim()) throw new AppError("VALIDATION", "closure_note_required");
  if (!d.rootCause) throw new AppError("VALIDATION", "root_cause_required");
  if (d.disposition === "PENDING" || (d.batchId && d.disposition === "HOLD")) throw new AppError("VALIDATION", "disposition_required");
  const open = d.capas.filter((c) => c.status !== "CLOSED" && c.status !== "REJECTED");
  if (open.length > 0) throw new AppError("INVALID_STATE", "open_capas_exist");
  if ((d.severity === "HIGH" || d.severity === "CRITICAL") && !d.capas.some((c) => c.status === "CLOSED")) {
    throw new AppError("INVALID_STATE", "verified_capa_required");
  }
  const u = await ctx.db.deviation.update({ where: { id }, data: { status: "CLOSED", closedById: requireUserId(ctx), closedAt: new Date(), closureNote: closureNote.trim().slice(0, 2000) } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "deviation.closed", entityType: "Deviation", entityId: id, summary: d.code });
  return u;
}

export async function setDeviationStatusFromCapas(db: TenantDb | Tx, deviationId: string) {
  const d = await (db as Tx).deviation.findUnique({ where: { id: deviationId }, include: { capas: { select: { status: true } } } });
  if (!d || d.status === "CLOSED") return;
  const next: DeviationStatus = d.capas.some((c) => c.status !== "REJECTED") ? "CAPA_IN_PROGRESS" : d.rootCause ? "INVESTIGATING" : d.status;
  if (next !== d.status) await (db as Tx).deviation.update({ where: { id: deviationId }, data: { status: next } });
}

export type { Disposition };
