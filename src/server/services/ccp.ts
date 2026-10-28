import "server-only";
import { z } from "zod";
import { ensure, type Ctx } from "../context";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { assertOwned } from "../db/tenant";
import { createDeviationTx } from "./deviations";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export const ccpRecordSchema = z.object({
  haccpControlId: z.string().min(1).max(40),
  value: z.preprocess((v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v), z.number().finite()),
  recordedAt: z.preprocess((v) => (v ? new Date(String(v)) : undefined), z.date().optional()),
  batchId: z.preprocess((v) => (v === "" ? null : v), z.string().max(40).nullable().optional()),
  note: z.preprocess((v) => (v === "" ? null : v), z.string().max(1000).nullable().optional()),
});

export function withinLimits(value: number, min: number | null, max: number | null) {
  return (min === null || value >= min) && (max === null || value <= max);
}

/** Records a CCP measurement (manual or via API). Out-of-limit values automatically open a HIGH deviation. */
export async function recordCcp(ctx: Ctx, input: z.infer<typeof ccpRecordSchema>, source: "MANUAL" | "API" = "MANUAL") {
  ensure(ctx, "ccp:record");
  const r = ccpRecordSchema.parse(input);
  const control = await ctx.db.haccpControl.findUnique({ where: { id: r.haccpControlId } });
  if (!control) throw new AppError("NOT_FOUND", "control_not_found");
  if (!control.isCcp || control.status !== "APPROVED") throw new AppError("INVALID_STATE", "control_not_active_ccp");
  if (control.criticalLimitMin === null && control.criticalLimitMax === null) throw new AppError("INVALID_STATE", "ccp_not_measurable");
  await assertOwned(ctx.db, "Batch", [r.batchId]);
  if (r.recordedAt && r.recordedAt.getTime() > Date.now() + 5 * 60_000) throw new AppError("VALIDATION", "recorded_in_future");
  const ok = withinLimits(r.value, control.criticalLimitMin, control.criticalLimitMax);
  return ctx.db.$transaction(async (t) => {
    const tx = t as unknown as Tx;
    const rec = await tx.ccpRecord.create({ data: { organizationId: ctx.orgId, haccpControlId: control.id, value: r.value, unit: control.limitUnit, withinLimits: ok, recordedAt: r.recordedAt ?? new Date(), recordedById: ctx.userId, source, batchId: r.batchId ?? null, note: r.note ?? null } });
    let deviationId: string | null = null;
    if (!ok) {
      const dev = await createDeviationTx(tx, ctx, {
        title: `${control.ccpCode ?? "CCP"} di luar batas kritis: ${r.value}${control.limitUnit ? " " + control.limitUnit : ""}`,
        description: `Tahap ${control.processStep}. Nilai ${r.value}${control.limitUnit ?? ""}, batas ${control.criticalLimitMin ?? "–"} s/d ${control.criticalLimitMax ?? "–"}. Tindakan koreksi yang ditetapkan: ${control.correctiveAction}`,
        severity: "HIGH", source: "CCP", haccpControlId: control.id, ccpRecordId: rec.id, batchId: r.batchId ?? null,
        immediateAction: null,
      });
      deviationId = dev.id;
    }
    await writeAudit(ctx.orgId, ctx.actor, { action: "ccp.recorded", entityType: "CcpRecord", entityId: rec.id, summary: `${control.ccpCode}: ${r.value} (${ok ? "OK" : "OUT"})`, metadata: { source, deviationId } }, tx);
    return { record: rec, deviationId };
  });
}

export async function listCcpRecords(ctx: Ctx, filter: { controlId?: string; since?: Date; until?: Date; outOnly?: boolean } = {}) {
  ensure(ctx, "ccp:read");
  return ctx.db.ccpRecord.findMany({
    where: {
      ...(filter.controlId ? { haccpControlId: filter.controlId } : {}),
      ...(filter.since || filter.until ? { recordedAt: { ...(filter.since ? { gte: filter.since } : {}), ...(filter.until ? { lte: filter.until } : {}) } } : {}),
      ...(filter.outOnly ? { withinLimits: false } : {}),
    },
    include: { haccpControl: { select: { ccpCode: true, processStep: true, criticalLimitMin: true, criticalLimitMax: true, limitUnit: true } }, batch: { select: { batchNumber: true } }, deviations: { select: { id: true, code: true } } },
    orderBy: { recordedAt: "desc" },
    take: 500,
  });
}
