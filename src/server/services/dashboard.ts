import "server-only";
import type { Ctx } from "../context";
import { certificateState } from "./suppliers";

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

/** Live KPIs computed from the database (no cached/static numbers). */
export async function getDashboard(ctx: Ctx, now = new Date()) {
  const db = ctx.db;
  const d7 = new Date(now.getTime() - 7 * 86400000);
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const [openDev, critDev, overdueCapa, openCapa, pendingVerif, ccpTotal7, ccpOk7, subsToday, subsFailed7, subs7, draftControls, approvedCcps, certs, devByDay, recentDev, activeTemplates, batchesHold] = await Promise.all([
    db.deviation.count({ where: { status: { not: "CLOSED" } } }),
    db.deviation.count({ where: { status: { not: "CLOSED" }, severity: { in: ["HIGH", "CRITICAL"] } } }),
    db.capa.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: now } } }),
    db.capa.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.capa.count({ where: { status: "PENDING_VERIFICATION" } }),
    db.ccpRecord.count({ where: { recordedAt: { gte: d7 } } }),
    db.ccpRecord.count({ where: { recordedAt: { gte: d7 }, withinLimits: true } }),
    db.checklistSubmission.count({ where: { submittedAt: { gte: startToday } } }),
    db.checklistSubmission.count({ where: { submittedAt: { gte: d7 }, status: "FAILED" } }),
    db.checklistSubmission.count({ where: { submittedAt: { gte: d7 } } }),
    db.haccpControl.count({ where: { status: "DRAFT" } }),
    db.haccpControl.count({ where: { status: "APPROVED", isCcp: true } }),
    db.supplierCertificate.findMany({ where: { expiresAt: { lte: new Date(now.getTime() + 60 * 86400000) } }, select: { id: true, type: true, number: true, expiresAt: true, supplier: { select: { id: true, name: true } } }, orderBy: { expiresAt: "asc" }, take: 10 }),
    db.deviation.findMany({ where: { createdAt: { gte: d30 } }, select: { createdAt: true, severity: true } }),
    db.deviation.findMany({ where: { status: { not: "CLOSED" } }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, code: true, title: true, severity: true, status: true, createdAt: true } }),
    db.checklistTemplate.count({ where: { status: "ACTIVE" } }),
    db.batch.count({ where: { status: "ON_HOLD" } }),
  ]);
  // Deviations per day for the last 14 days (in org timezone).
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.org.timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const days: Array<{ day: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) days.push({ day: fmt.format(new Date(now.getTime() - i * 86400000)), count: 0 });
  for (const d of devByDay) {
    const k = fmt.format(d.createdAt);
    const slot = days.find((x) => x.day === k);
    if (slot) slot.count++;
  }
  return {
    openDeviations: openDev, criticalDeviations: critDev, overdueCapas: overdueCapa, openCapas: openCapa, pendingVerification: pendingVerif,
    ccpCompliance7d: ccpTotal7 ? Math.round((ccpOk7 / ccpTotal7) * 1000) / 10 : null, ccpRecords7d: ccpTotal7,
    checklistsToday: subsToday, checklistFailRate7d: subs7 ? Math.round((subsFailed7 / subs7) * 1000) / 10 : null,
    draftControls, approvedCcps, activeTemplates, batchesOnHold: batchesHold,
    certificates: certs.map((c) => ({ ...c, state: certificateState(c.expiresAt, now) })),
    deviationsPerDay: days, recentDeviations: recentDev,
  };
}
