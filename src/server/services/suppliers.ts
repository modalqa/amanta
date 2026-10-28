import "server-only";
import { z } from "zod";
import { ensure, type Ctx } from "../context";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { assertOwned } from "../db/tenant";
import type { CertificateType } from "@/generated/prisma/enums";

const opt = (max: number) => z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(max).nullable());
const optDate = z.preprocess((v) => (v === "" || v == null ? null : new Date(String(v))), z.date().nullable());

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: opt(40),
  contactName: opt(100),
  email: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().email().max(200).nullable()),
  phone: opt(40),
  address: opt(500),
  status: z.enum(["PENDING", "APPROVED", "SUSPENDED"]).default("PENDING"),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  notes: opt(2000),
});

export const certificateSchema = z.object({
  type: z.enum(["HALAL", "BPOM", "SPP_IRT", "SNI", "ISO_22000", "FSSC_22000", "HACCP", "GMP", "COA", "NIB", "OTHER"]),
  number: z.string().trim().min(1).max(100),
  issuer: opt(150),
  issuedAt: optDate,
  expiresAt: optDate,
  documentId: opt(40),
  notes: opt(1000),
});

export type CertState = "VALID" | "EXPIRING" | "EXPIRED" | "NO_EXPIRY";
export function certificateState(expiresAt: Date | null, now = new Date(), warnDays = 60): CertState {
  if (!expiresAt) return "NO_EXPIRY";
  if (expiresAt < now) return "EXPIRED";
  if (expiresAt.getTime() - now.getTime() <= warnDays * 86400000) return "EXPIRING";
  return "VALID";
}

export async function listSuppliers(ctx: Ctx) {
  ensure(ctx, "suppliers:read");
  const rows = await ctx.db.supplier.findMany({ include: { certificates: { select: { type: true, expiresAt: true } }, _count: { select: { ingredients: true, lots: true } } }, orderBy: { name: "asc" } });
  return rows.map((s) => {
    const states = s.certificates.map((c) => certificateState(c.expiresAt));
    return { ...s, certSummary: { total: s.certificates.length, expired: states.filter((x) => x === "EXPIRED").length, expiring: states.filter((x) => x === "EXPIRING").length, hasHalal: s.certificates.some((c) => c.type === "HALAL" && certificateState(c.expiresAt) !== "EXPIRED") } };
  });
}

export async function getSupplier(ctx: Ctx, id: string) {
  ensure(ctx, "suppliers:read");
  const s = await ctx.db.supplier.findUnique({ where: { id }, include: { certificates: { include: { document: { select: { id: true, title: true } } }, orderBy: { expiresAt: "asc" } }, ingredients: true, lots: { orderBy: { receivedAt: "desc" }, take: 20, include: { ingredient: { select: { name: true } } } }, deviations: { select: { id: true, code: true, title: true, status: true }, take: 20, orderBy: { createdAt: "desc" } } } });
  if (!s) throw new AppError("NOT_FOUND", "supplier_not_found");
  return s;
}

export async function createSupplier(ctx: Ctx, input: z.infer<typeof supplierSchema>) {
  ensure(ctx, "suppliers:write");
  const d = supplierSchema.parse(input);
  if (await ctx.db.supplier.findFirst({ where: { name: d.name } })) throw new AppError("CONFLICT", "supplier_exists");
  const s = await ctx.db.supplier.create({ data: { ...d, organizationId: ctx.orgId } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "supplier.created", entityType: "Supplier", entityId: s.id, summary: d.name });
  return s;
}

export async function updateSupplier(ctx: Ctx, id: string, input: z.infer<typeof supplierSchema>) {
  ensure(ctx, "suppliers:write");
  const before = await ctx.db.supplier.findUnique({ where: { id } });
  if (!before) throw new AppError("NOT_FOUND", "supplier_not_found");
  const d = supplierSchema.parse(input);
  if (d.status === "APPROVED" && before.status !== "APPROVED") {
    const certs = await ctx.db.supplierCertificate.findMany({ where: { supplierId: id } });
    if (!certs.some((c) => certificateState(c.expiresAt) !== "EXPIRED")) throw new AppError("VALIDATION", "approval_requires_valid_certificate");
  }
  const s = await ctx.db.supplier.update({ where: { id }, data: d });
  await writeAudit(ctx.orgId, ctx.actor, { action: "supplier.updated", entityType: "Supplier", entityId: id, metadata: { status: { from: before.status, to: d.status } } });
  return s;
}

export async function addCertificate(ctx: Ctx, supplierId: string, input: z.infer<typeof certificateSchema>) {
  ensure(ctx, "suppliers:write");
  const c = certificateSchema.parse(input);
  await assertOwned(ctx.db, "Supplier", [supplierId]);
  await assertOwned(ctx.db, "Document", [c.documentId]);
  if (c.issuedAt && c.expiresAt && c.issuedAt > c.expiresAt) throw new AppError("VALIDATION", "issued_after_expiry");
  const cert = await ctx.db.supplierCertificate.create({ data: { ...c, type: c.type as CertificateType, supplierId, organizationId: ctx.orgId } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "supplier.certificate_added", entityType: "Supplier", entityId: supplierId, summary: `${c.type} ${c.number}`, metadata: { expiresAt: c.expiresAt?.toISOString() ?? null } });
  return cert;
}

export async function deleteCertificate(ctx: Ctx, id: string) {
  ensure(ctx, "suppliers:write");
  const cert = await ctx.db.supplierCertificate.findUnique({ where: { id } });
  if (!cert) throw new AppError("NOT_FOUND", "certificate_not_found");
  await ctx.db.supplierCertificate.delete({ where: { id } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "supplier.certificate_removed", entityType: "Supplier", entityId: cert.supplierId, summary: `${cert.type} ${cert.number}` });
}

export async function listCertificates(ctx: Ctx, opts: { expiringWithinDays?: number } = {}) {
  ensure(ctx, "suppliers:read");
  const certs = await ctx.db.supplierCertificate.findMany({
    where: opts.expiringWithinDays !== undefined ? { expiresAt: { lte: new Date(Date.now() + opts.expiringWithinDays * 86400000) } } : {},
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: { expiresAt: "asc" },
  });
  return certs.map((c) => ({ ...c, state: certificateState(c.expiresAt) }));
}
