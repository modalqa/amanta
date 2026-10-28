import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { resetDb, makeOrg, ctxFor } from "../helpers/db";
import { createSupplier, getSupplier, listSuppliers, updateSupplier, addCertificate } from "@/server/services/suppliers";
import { createProduct } from "@/server/services/haccp";
import { createBatch, receiveLot, createIngredient } from "@/server/services/traceability";
import { reportDeviation, getDeviation, listDeviations } from "@/server/services/deviations";
import { tenantDb, assertOwned } from "@/server/db/tenant";
import { AppError } from "@/server/errors";

describe("tenant isolation", () => {
  beforeEach(resetDb);

  it("never returns or mutates another tenant's rows through the scoped client", async () => {
    const a = await makeOrg("Pabrik A");
    const b = await makeOrg("Pabrik B");
    const ctxA = await ctxFor(a.id, "QA_MANAGER");
    const ctxB = await ctxFor(b.id, "QA_MANAGER");
    const supA = await createSupplier(ctxA, { name: "Supplier A", code: null, contactName: null, email: null, phone: null, address: null, status: "PENDING", riskLevel: "MEDIUM", notes: null });

    expect(await listSuppliers(ctxB)).toHaveLength(0);
    await expect(getSupplier(ctxB, supA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateSupplier(ctxB, supA.id, { name: "hijacked", code: null, contactName: null, email: null, phone: null, address: null, status: "PENDING", riskLevel: "LOW", notes: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addCertificate(ctxB, supA.id, { type: "HALAL", number: "X", issuer: null, issuedAt: null, expiresAt: null, documentId: null, notes: null })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Raw scoped client: update/delete by id from another tenant affects nothing / throws.
    const dbB = tenantDb(b.id);
    expect(await dbB.supplier.findUnique({ where: { id: supA.id } })).toBeNull();
    expect((await dbB.supplier.updateMany({ where: { id: supA.id }, data: { name: "x" } })).count).toBe(0);
    await expect(dbB.supplier.delete({ where: { id: supA.id } })).rejects.toBeTruthy();
    expect((await prisma.supplier.findUniqueOrThrow({ where: { id: supA.id } })).name).toBe("Supplier A");
  });

  it("rejects explicit cross-tenant organizationId in writes and filters", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const dbA = tenantDb(a.id);
    await expect(dbA.supplier.create({ data: { organizationId: b.id, name: "evil" } })).rejects.toBeInstanceOf(AppError);
    await expect(dbA.supplier.findMany({ where: { organizationId: b.id } })).rejects.toMatchObject({ code: "TENANT_VIOLATION" });
  });

  it("prevents linking records to ids owned by another tenant", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const ctxA = await ctxFor(a.id, "OWNER");
    const ctxB = await ctxFor(b.id, "OWNER");
    const prodB = await createProduct(ctxB, { name: "Produk B", code: null, description: null, shelfLifeDays: null, halalCertified: false, bpomNumber: null });
    await expect(createBatch(ctxA, { batchNumber: "B-1", productId: prodB.id, productionDate: new Date(), expiryDate: null, quantity: 10, unit: "kg", line: null, notes: null, inputs: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const ingB = await createIngredient(ctxB, { name: "Gula", code: null, supplierId: null, allergens: [], halalCritical: false, specification: null, unit: "kg" });
    await expect(receiveLot(ctxA, { ingredientId: ingB.id, supplierId: null, lotNumber: "L1", receivedAt: new Date(), quantity: 5, unit: "kg", expiryDate: null, coaDocumentId: null, notes: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assertOwned(ctxA.db, "Product", [prodB.id])).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps scoping inside interactive transactions (deviation numbering per tenant)", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const ctxA = await ctxFor(a.id, "SUPERVISOR");
    const ctxB = await ctxFor(b.id, "SUPERVISOR");
    const d1 = await reportDeviation(ctxA, { title: "Suhu chiller tinggi", description: "8 °C", severity: "MEDIUM", source: "MANUAL" });
    const d2 = await reportDeviation(ctxB, { title: "Kemasan bocor", description: "Kemasan bocor di lini 2", severity: "LOW", source: "MANUAL" });
    expect(d1.code).toMatch(/^DEV-\d{4}-0001$/);
    expect(d2.code).toMatch(/^DEV-\d{4}-0001$/);
    expect(await listDeviations(ctxB)).toHaveLength(1);
    await expect(getDeviation(ctxB, d1.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Audit entries belong to the right tenant only.
    expect(await prisma.auditLog.count({ where: { organizationId: a.id, entityId: d2.id } })).toBe(0);
  });
});

describe("role-based access", () => {
  beforeEach(resetDb);
  it("enforces permissions server-side", async () => {
    const a = await makeOrg();
    const auditor = await ctxFor(a.id, "AUDITOR");
    const operator = await ctxFor(a.id, "OPERATOR");
    await expect(createSupplier(auditor, { name: "S", code: null, contactName: null, email: null, phone: null, address: null, status: "PENDING", riskLevel: "MEDIUM", notes: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reportDeviation(auditor, { title: "abc", description: "abc", severity: "LOW", source: "MANUAL" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createProduct(operator, { name: "P", code: null, description: null, shelfLifeDays: null, halalCertified: false, bpomNumber: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reportDeviation(operator, { title: "Operator report", description: "found glass", severity: "HIGH", source: "MANUAL" })).resolves.toBeTruthy();
  });
});
