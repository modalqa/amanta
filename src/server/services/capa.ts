import "server-only";
import { z } from "zod";
import { ensure, requireUserId, type Ctx } from "../context";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { nextCode } from "../counters";
import { setDeviationStatusFromCapas } from "./deviations";
import type { Prisma } from "@/generated/prisma/client";
import type { CapaStatus } from "@/generated/prisma/enums";
import { capaDraftSchema } from "../ai/prompts";

type Tx = Prisma.TransactionClient;

export const capaSchema = z.object({
  type: z.enum(["CORRECTIVE", "PREVENTIVE"]),
  title: z.string().trim().min(3).max(200),
  rootCause: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(4000).nullable().optional()),
  actionPlan: z.string().trim().min(3).max(4000),
  assigneeId: z.string().min(1).max(40),
  dueDate: z.preprocess((v) => (v ? new Date(String(v)) : v), z.date()),
  aiDrafted: z.boolean().optional(),
});

async function assertAssignable(ctx: Ctx, userId: string) {
  const m = await ctx.db.membership.findFirst({ where: { userId, active: true } });
  if (!m || m.role === "AUDITOR") throw new AppError("VALIDATION", "assignee_not_member");
}

export async function createCapa(ctx: Ctx, deviationId: string, input: z.infer<typeof capaSchema>) {
  ensure(ctx, "capa:manage");
  const c = capaSchema.parse(input);
  const dev = await ctx.db.deviation.findUnique({ where: { id: deviationId } });
  if (!dev) throw new AppError("NOT_FOUND", "deviation_not_found");
  if (dev.status === "CLOSED") throw new AppError("INVALID_STATE", "deviation_closed");
  await assertAssignable(ctx, c.assigneeId);
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  if (c.dueDate < startOfToday) throw new AppError("VALIDATION", "due_date_in_past");
  return ctx.db.$transaction(async (t) => {
    const tx = t as unknown as Tx;
    const code = await nextCode(tx, ctx.orgId, "CAPA");
    const capa = await tx.capa.create({
      data: { organizationId: ctx.orgId, deviationId, code, type: c.type, title: c.title, rootCause: c.rootCause ?? dev.rootCause, actionPlan: c.actionPlan, assigneeId: c.assigneeId, dueDate: c.dueDate, aiDrafted: !!c.aiDrafted, createdById: requireUserId(ctx) },
    });
    await tx.notification.create({ data: { organizationId: ctx.orgId, userId: c.assigneeId, type: "CAPA_ASSIGNED", title: `${code}: ${c.title.slice(0, 120)}`, body: `Due ${c.dueDate.toISOString().slice(0, 10)}`, link: `/app/capa/${capa.id}` } });
    await setDeviationStatusFromCapas(tx, deviationId);
    await writeAudit(ctx.orgId, ctx.actor, { action: "capa.created", entityType: "Capa", entityId: capa.id, summary: `${code} for ${dev.code}`, metadata: { assigneeId: c.assigneeId, dueDate: c.dueDate.toISOString(), aiDrafted: !!c.aiDrafted } }, tx);
    return capa;
  });
}

/** Turns a SUCCEEDED AI CAPA draft into real CAPA records after a human picks the assignee. */
export async function acceptCapaDraft(ctx: Ctx, aiRunId: string, assigneeId: string, selected: number[]) {
  ensure(ctx, "capa:manage");
  const run = await ctx.db.aiRun.findUnique({ where: { id: aiRunId } });
  if (!run || run.kind !== "CAPA_DRAFT" || run.status !== "SUCCEEDED" || !run.deviationId) throw new AppError("INVALID_STATE", "ai_draft_unavailable");
  const draft = capaDraftSchema.parse(run.output);
  const items = [...draft.corrective.map((c) => ({ ...c, type: "CORRECTIVE" as const })), ...draft.preventive.map((c) => ({ ...c, type: "PREVENTIVE" as const }))];
  const chosen = items.filter((_, i) => selected.includes(i));
  if (chosen.length === 0) throw new AppError("VALIDATION", "nothing_selected");
  const dev = await ctx.db.deviation.findUnique({ where: { id: run.deviationId } });
  if (dev && !dev.rootCause) await ctx.db.deviation.update({ where: { id: dev.id }, data: { rootCause: draft.rootCauseAnalysis.slice(0, 4000) } });
  const created = [];
  for (const it of chosen) {
    created.push(await createCapa(ctx, run.deviationId, { type: it.type, title: it.title, actionPlan: it.actionPlan, rootCause: draft.rootCauseAnalysis.slice(0, 4000), assigneeId, dueDate: new Date(Date.now() + it.dueInDays * 86400000), aiDrafted: true }));
  }
  return created;
}

export async function listCapas(ctx: Ctx, filter: { status?: CapaStatus; mine?: boolean; overdue?: boolean } = {}) {
  ensure(ctx, "capa:read");
  return ctx.db.capa.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.mine && ctx.userId ? { assigneeId: ctx.userId } : {}),
      ...(filter.overdue ? { dueDate: { lt: new Date() }, status: { in: ["OPEN", "IN_PROGRESS"] } } : {}),
    },
    include: { deviation: { select: { id: true, code: true, title: true, severity: true } } },
    orderBy: [{ dueDate: "asc" }],
    take: 300,
  });
}

export async function getCapa(ctx: Ctx, id: string) {
  ensure(ctx, "capa:read");
  const c = await ctx.db.capa.findUnique({ where: { id }, include: { deviation: { select: { id: true, code: true, title: true, severity: true, status: true } } } });
  if (!c) throw new AppError("NOT_FOUND", "capa_not_found");
  return c;
}

function isManager(ctx: Ctx) { return ctx.permissions.has("capa:manage"); }

export async function startCapa(ctx: Ctx, id: string) {
  ensure(ctx, "capa:work");
  const c = await getCapa(ctx, id);
  if (c.assigneeId !== ctx.userId && !isManager(ctx)) throw new AppError("FORBIDDEN", "not_assignee");
  if (c.status !== "OPEN") throw new AppError("INVALID_STATE", "capa_not_open");
  await ctx.db.capa.update({ where: { id }, data: { status: "IN_PROGRESS" } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "capa.started", entityType: "Capa", entityId: id });
}

export async function completeCapa(ctx: Ctx, id: string, completionNote: string) {
  ensure(ctx, "capa:work");
  const c = await getCapa(ctx, id);
  if (c.assigneeId !== ctx.userId && !isManager(ctx)) throw new AppError("FORBIDDEN", "not_assignee");
  if (c.status !== "OPEN" && c.status !== "IN_PROGRESS") throw new AppError("INVALID_STATE", "capa_not_active");
  if (completionNote.trim().length < 5) throw new AppError("VALIDATION", "completion_note_required");
  await ctx.db.capa.update({ where: { id }, data: { status: "PENDING_VERIFICATION", completedAt: new Date(), completionNote: completionNote.trim().slice(0, 4000) } });
  await ctx.db.notification.create({ data: { organizationId: ctx.orgId, type: "CAPA_PENDING_VERIFICATION", title: `${c.code} menunggu verifikasi`, link: `/app/capa/${id}` } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "capa.completed", entityType: "Capa", entityId: id });
}

/**
 * Effectiveness verification. Segregation of duties: the verifier must not be the assignee.
 * Ineffective → CAPA goes back to IN_PROGRESS for rework.
 */
export async function verifyCapa(ctx: Ctx, id: string, effective: boolean, note: string) {
  ensure(ctx, "capa:verify");
  const userId = requireUserId(ctx);
  const c = await getCapa(ctx, id);
  if (c.status !== "PENDING_VERIFICATION") throw new AppError("INVALID_STATE", "capa_not_pending_verification");
  if (c.assigneeId === userId) throw new AppError("FORBIDDEN", "verifier_must_differ_from_assignee");
  if (note.trim().length < 5) throw new AppError("VALIDATION", "verification_note_required");
  await ctx.db.capa.update({
    where: { id },
    data: effective
      ? { status: "CLOSED", effective: true, verifiedById: userId, verifiedAt: new Date(), verificationNote: note.trim().slice(0, 4000) }
      : { status: "IN_PROGRESS", effective: false, verifiedById: userId, verifiedAt: new Date(), verificationNote: note.trim().slice(0, 4000), completedAt: null },
  });
  await writeAudit(ctx.orgId, ctx.actor, { action: effective ? "capa.verified_effective" : "capa.verified_ineffective", entityType: "Capa", entityId: id, metadata: { note } });
}

export async function rejectCapa(ctx: Ctx, id: string, reason: string) {
  ensure(ctx, "capa:manage");
  const c = await getCapa(ctx, id);
  if (c.status === "CLOSED") throw new AppError("INVALID_STATE", "capa_closed");
  if (!reason.trim()) throw new AppError("VALIDATION", "reason_required");
  await ctx.db.capa.update({ where: { id }, data: { status: "REJECTED", verificationNote: reason.slice(0, 2000) } });
  await setDeviationStatusFromCapas(ctx.db, c.deviationId);
  await writeAudit(ctx.orgId, ctx.actor, { action: "capa.rejected", entityType: "Capa", entityId: id, metadata: { reason } });
}
