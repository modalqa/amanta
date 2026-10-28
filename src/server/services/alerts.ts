import "server-only";
import { prisma } from "../db/client";
import { tenantDb } from "../db/tenant";
import { certificateState } from "./suppliers";

/**
 * Daily scan across organizations: certificate expiry (60/30/7/0 days), overdue CAPAs and
 * expiring ingredient lots. Notifications are de-duplicated with a stable key.
 */
export async function runDailyAlerts(now: Date) {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let created = 0;
  for (const { id: orgId } of orgs) {
    const db = tenantDb(orgId);
    const notify = async (dedupeKey: string, data: { type: string; title: string; body?: string; link?: string; userId?: string | null }) => {
      const res = await db.notification.createMany({ data: [{ organizationId: orgId, dedupeKey, ...data }], skipDuplicates: true });
      created += res.count;
    };
    const certs = await db.supplierCertificate.findMany({ where: { expiresAt: { lte: new Date(now.getTime() + 60 * 86400000) } }, include: { supplier: { select: { name: true } } } });
    for (const c of certs) {
      const state = certificateState(c.expiresAt, now);
      const days = Math.ceil((c.expiresAt!.getTime() - now.getTime()) / 86400000);
      const bucket = state === "EXPIRED" ? "expired" : days <= 7 ? "7" : days <= 30 ? "30" : "60";
      await notify(`cert:${c.id}:${bucket}`, {
        type: state === "EXPIRED" ? "CERTIFICATE_EXPIRED" : "CERTIFICATE_EXPIRING",
        title: state === "EXPIRED" ? `Sertifikat ${c.type} ${c.supplier.name} kedaluwarsa` : `Sertifikat ${c.type} ${c.supplier.name} berakhir dalam ${days} hari`,
        body: `No. ${c.number}`, link: `/app/suppliers/${c.supplierId}`,
      });
      await db.supplierCertificate.update({ where: { id: c.id }, data: { lastAlertAt: now } });
    }
    const overdue = await db.capa.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: now } } });
    for (const c of overdue) {
      await notify(`capa-overdue:${c.id}:${now.toISOString().slice(0, 10)}`, { type: "CAPA_OVERDUE", title: `${c.code} melewati tenggat`, link: `/app/capa/${c.id}`, userId: c.assigneeId });
    }
    const lots = await db.ingredientLot.findMany({ where: { status: { in: ["QUARANTINE", "RELEASED"] }, expiryDate: { lte: new Date(now.getTime() + 14 * 86400000) } }, include: { ingredient: { select: { name: true } } } });
    for (const l of lots) {
      await notify(`lot-expiry:${l.id}`, { type: "LOT_EXPIRING", title: `Lot ${l.lotNumber} (${l.ingredient.name}) segera/sudah kedaluwarsa`, link: `/app/lots` });
    }
  }
  return { organizations: orgs.length, created };
}
