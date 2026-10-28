import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { prisma } from "@/server/db/client";
import { resetDb, makeOrg, ctxFor, makeUser } from "../helpers/db";
import { authenticate, registerAccount, inviteMember, acceptInvitation, updateMember } from "@/server/services/accounts";
import { createApiKey, revokeApiKey, setAiKey } from "@/server/services/settings";
import { authenticateApiKey } from "@/server/auth/apikey";
import { rateLimit } from "@/server/ratelimit";
import { writeAudit, verifyAuditChain } from "@/server/audit";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { validateUpload } from "@/server/extract/filetype";
import { extractText } from "@/server/extract/text";
import { LocalStorage } from "@/server/storage";
import { addCertificate, createSupplier, updateSupplier } from "@/server/services/suppliers";
import { addShipment, createBatch, createIngredient, receiveLot, setBatchStatus, setLotStatus } from "@/server/services/traceability";
import { createControl, reviewControl, updateControl, createProduct } from "@/server/services/haccp";
import { recordCcp } from "@/server/services/ccp";
import { createCapa, completeCapa, verifyCapa } from "@/server/services/capa";
import { closeDeviation, reportDeviation, updateInvestigation } from "@/server/services/deviations";
import { runDailyAlerts } from "@/server/services/alerts";
import { AI_SECRET_NAME } from "@/server/ai";
import type { Ctx } from "@/server/context";

afterAll(async () => { await rm("./storage-test", { recursive: true, force: true }); });

async function pdfBuffer(text: string) {
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));
  doc.text(text);
  doc.end();
  return done;
}

const supplierInput = (name: string) => ({ name, code: null, contactName: null, email: null, phone: null, address: null, status: "PENDING" as const, riskLevel: "MEDIUM" as const, notes: null });

describe("authentication & membership", () => {
  beforeEach(resetDb);

  it("registers, authenticates, locks out after repeated failures", async () => {
    const { user, org } = await registerAccount({ name: "Rina", email: "Rina@Example.test", password: "Rahasia-Kuat-123", organizationName: "PT Uji" }, "10.0.0.1");
    expect(user.email).toBe("rina@example.test");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect((await prisma.membership.findFirstOrThrow({ where: { userId: user.id } })).role).toBe("OWNER");
    const ok = await authenticate("rina@example.test", "Rahasia-Kuat-123", "10.0.0.1");
    expect(ok.defaultOrgId).toBe(org.id);
    await expect(registerAccount({ name: "Xavier", email: "rina@example.test", password: "Rahasia-Kuat-123", organizationName: "PT Lain" }, "10.0.0.2")).rejects.toMatchObject({ message: "email_taken" });
    for (let i = 0; i < 5; i++) await expect(authenticate("rina@example.test", "salah-sekali-1", "10.0.0.3")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(authenticate("rina@example.test", "Rahasia-Kuat-123", "10.0.0.3")).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
    await expect(authenticate("nobody@example.test", "whatever-123", "10.0.0.3")).rejects.toMatchObject({ message: "invalid_credentials" });
  });

  it("invitations are single-use, role-bounded and the last owner is protected", async () => {
    const org = await makeOrg();
    const owner = await ctxFor(org.id, "OWNER");
    const admin = await ctxFor(org.id, "ADMIN");
    await expect(inviteMember(admin, { email: "x@e.test", role: "OWNER" })).rejects.toMatchObject({ message: "cannot_assign_role" });
    const { token } = await inviteMember(owner, { email: "new@e.test", role: "OPERATOR" });
    const res = await acceptInvitation({ token, name: "Operator Baru", password: "Rahasia-Kuat-999" }, "1.1.1.1");
    expect(res.organizationId).toBe(org.id);
    await expect(acceptInvitation({ token, name: "Again", password: "Rahasia-Kuat-999" }, "1.1.1.1")).rejects.toMatchObject({ message: "invitation_invalid" });
    const ownerMembership = await prisma.membership.findFirstOrThrow({ where: { userId: owner.userId! } });
    await expect(updateMember(admin, ownerMembership.id, { active: false })).rejects.toMatchObject({ message: "cannot_modify_owner" });
    expect(await prisma.invitation.findFirst({ where: { tokenHash: token } })).toBeNull(); // only the hash is stored
  });
});

describe("API keys, rate limiting, encryption, audit integrity", () => {
  beforeEach(resetDb);

  it("API keys are hashed, scoped, revocable", async () => {
    const org = await makeOrg();
    const owner = await ctxFor(org.id, "OWNER");
    const { key, row } = await createApiKey(owner, { name: "Sensor", scopes: ["ccp:record"], expiresInDays: 30 });
    expect(row.keyHash).not.toContain(key);
    const ctx = await authenticateApiKey(`Bearer ${key}`, "9.9.9.9");
    expect(ctx.orgId).toBe(org.id);
    expect(ctx.permissions.has("ccp:record")).toBe(true);
    expect(ctx.permissions.has("deviations:read")).toBe(false);
    await expect(authenticateApiKey(`Bearer ${key.slice(0, -2)}xx`, "9.9.9.9")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await revokeApiKey(owner, row.id);
    await expect(authenticateApiKey(`Bearer ${key}`, "9.9.9.9")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rate limiter blocks after the limit within a window", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("t:key", 3, 60);
    await expect(rateLimit("t:key", 3, 60)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("encrypts per-org AI keys with AES-GCM bound to the organization", async () => {
    const org = await makeOrg();
    const owner = await ctxFor(org.id, "OWNER");
    await setAiKey(owner, "sk-test-SECRET");
    const row = await prisma.orgSecret.findFirstOrThrow({ where: { organizationId: org.id, name: AI_SECRET_NAME } });
    expect(row.ciphertext).not.toContain("SECRET");
    expect(decryptSecret(row, `${org.id}:${AI_SECRET_NAME}`)).toBe("sk-test-SECRET");
    expect(() => decryptSecret(row, `other-org:${AI_SECRET_NAME}`)).toThrow();
    const enc = encryptSecret("x", "aad");
    expect(() => decryptSecret({ ...enc, ciphertext: Buffer.from("tampered").toString("base64") }, "aad")).toThrow();
    // The key is never written to the audit log.
    const audit = await prisma.auditLog.findMany({ where: { organizationId: org.id } });
    expect(JSON.stringify(audit)).not.toContain("SECRET");
  });

  it("audit log is append-only at the database level and tampering is detected", async () => {
    const org = await makeOrg();
    for (let i = 0; i < 5; i++) await writeAudit(org.id, { userId: null, ip: "t" }, { action: `test.${i}`, entityType: "Test", metadata: { i } });
    expect(await verifyAuditChain(org.id)).toEqual({ ok: true, checked: 5 });
    await expect(prisma.auditLog.updateMany({ where: { organizationId: org.id, seq: 3 }, data: { summary: "edited" } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.deleteMany({ where: { organizationId: org.id } })).rejects.toThrow(/append-only/);
    // Simulate a privileged tamper (trigger disabled) → chain verification catches it.
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER "AuditLog_append_only"`),
      prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "action" = 'forged' WHERE "organizationId" = '${org.id}' AND "seq" = 3`),
      prisma.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER "AuditLog_append_only"`),
    ]);
    expect(await verifyAuditChain(org.id)).toMatchObject({ ok: false, brokenAtSeq: 3 });
  });
});

describe("documents: validation, extraction, storage", () => {
  it("validates by magic bytes and rejects mismatches", async () => {
    const pdf = await pdfBuffer("SOP pemasakan suhu inti 75 C");
    await expect(validateUpload(pdf, "sop.pdf", 1e6)).resolves.toMatchObject({ kind: "pdf" });
    await expect(validateUpload(pdf, "sop.docx", 1e6)).rejects.toMatchObject({ message: "file_extension_mismatch" });
    await expect(validateUpload(Buffer.from("MZ\x90\x00binary"), "x.pdf", 1e6)).rejects.toMatchObject({ message: "file_type_not_allowed" });
    await expect(validateUpload(Buffer.from("a\u0000b"), "x.txt", 1e6)).rejects.toMatchObject({ message: "file_binary_content" });
    await expect(validateUpload(Buffer.from("<script>"), "x.html", 1e6)).rejects.toMatchObject({ message: "file_type_not_allowed" });
    await expect(validateUpload(Buffer.alloc(10, 65), "x.txt", 5)).rejects.toMatchObject({ message: "file_too_large" });
  });

  it("extracts text from PDF, DOCX, XLSX and TXT", async () => {
    const pdf = await extractText(await pdfBuffer("Pemasakan suhu inti minimal 75 C"), "pdf");
    expect(pdf.text).toContain("suhu inti minimal 75");
    expect(pdf.pageCount).toBe(1);
    const docx = await extractText(readFileSync("tests/fixtures/sop-pasteurisasi.docx"), "docx");
    expect(docx.text).toContain("Pasteurisasi pada suhu minimal 72");
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("HACCP").addRows([["Tahap", "Batas"], ["Pemasakan", "≥ 75 °C"]]);
    const xlsx = await extractText(Buffer.from(await wb.xlsx.writeBuffer()), "xlsx");
    expect(xlsx.text).toContain("Pemasakan | ≥ 75 °C");
    expect((await extractText(Buffer.from("halo"), "image")).warnings).toContain("image_ocr_not_supported");
  });

  it("local storage refuses path traversal", async () => {
    const s = new LocalStorage("./storage-test");
    await s.put("org/a/docs/x.txt", Buffer.from("ok"), "text/plain");
    expect((await s.get("org/a/docs/x.txt")).toString()).toBe("ok");
    await expect(s.get("../etc/passwd")).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    await expect(s.get("org/../../secret")).rejects.toMatchObject({ code: "STORAGE_FAILED" });
  });
});

describe("food-safety business rules", () => {
  let qa: Ctx, op: Ctx;
  beforeEach(async () => {
    await resetDb();
    const org = await makeOrg();
    qa = await ctxFor(org.id, "QA_MANAGER");
    op = await ctxFor(org.id, "OPERATOR");
  });

  it("supplier approval requires a valid certificate; halal-critical lots need a valid halal certificate", async () => {
    const s = await createSupplier(qa, supplierInput("CV Daging"));
    await expect(updateSupplier(qa, s.id, { ...supplierInput("CV Daging"), status: "APPROVED" })).rejects.toMatchObject({ message: "approval_requires_valid_certificate" });
    await addCertificate(qa, s.id, { type: "NIB", number: "1234567890123", issuer: null, issuedAt: null, expiresAt: null, documentId: null, notes: null });
    await updateSupplier(qa, s.id, { ...supplierInput("CV Daging"), status: "APPROVED" });
    const ing = await createIngredient(qa, { name: "Daging sapi", code: null, supplierId: s.id, allergens: [], halalCritical: true, specification: null, unit: "kg" });
    const lot = await receiveLot(qa, { ingredientId: ing.id, supplierId: s.id, lotNumber: "L-1", receivedAt: new Date(), quantity: 10, unit: "kg", expiryDate: null, coaDocumentId: null, notes: null });
    await expect(setLotStatus(qa, lot.id, "RELEASED")).rejects.toMatchObject({ message: "halal_certificate_required" });
    await addCertificate(qa, s.id, { type: "HALAL", number: "ID-HALAL-1", issuer: "BPJPH", issuedAt: null, expiresAt: new Date(Date.now() - 86400000), documentId: null, notes: null });
    await expect(setLotStatus(qa, lot.id, "RELEASED")).rejects.toMatchObject({ message: "halal_certificate_required" });
    await addCertificate(qa, s.id, { type: "HALAL", number: "ID-HALAL-2", issuer: "BPJPH", issuedAt: null, expiresAt: new Date(Date.now() + 86400000 * 100), documentId: null, notes: null });
    await setLotStatus(qa, lot.id, "RELEASED");
  });

  it("batches only consume released lots; release is blocked by open deviations; shipments cannot exceed quantity", async () => {
    const product = await createProduct(qa, { name: "Sambal", code: null, description: null, shelfLifeDays: 180, halalCertified: false, bpomNumber: null });
    const ing = await createIngredient(qa, { name: "Cabai", code: null, supplierId: null, allergens: [], halalCritical: false, specification: null, unit: "kg" });
    const lot = await receiveLot(qa, { ingredientId: ing.id, supplierId: null, lotNumber: "C-1", receivedAt: new Date(), quantity: 100, unit: "kg", expiryDate: null, coaDocumentId: null, notes: null });
    const batchInput = { batchNumber: "S-1", productId: product.id, productionDate: new Date(), expiryDate: null, quantity: 50, unit: "kg", line: null, notes: null, inputs: [{ lotId: lot.id, quantity: 40, unit: "kg" }] };
    await expect(createBatch(qa, batchInput)).rejects.toMatchObject({ message: "lots_not_released" });
    await setLotStatus(qa, lot.id, "RELEASED");
    const batch = await createBatch(qa, batchInput);
    const dev = await reportDeviation(op, { title: "Benda asing", description: "Ditemukan plastik", severity: "LOW", source: "MANUAL", batchId: batch.id });
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe("ON_HOLD");
    await expect(setBatchStatus(qa, batch.id, "RELEASED")).rejects.toMatchObject({ message: "open_deviations_block_release" });
    await updateInvestigation(qa, dev.id, { rootCause: "Kemasan robek", immediateAction: "Sortir", disposition: "RELEASE" });
    await closeDeviation(qa, dev.id, "Sortir 100%, tidak ditemukan lagi");
    await setBatchStatus(qa, batch.id, "RELEASED");
    await addShipment(qa, batch.id, { customer: "Toko A", destination: null, quantity: 30, unit: "kg", shippedAt: new Date(), reference: null });
    await expect(addShipment(qa, batch.id, { customer: "Toko B", destination: null, quantity: 21, unit: "kg", shippedAt: new Date(), reference: null })).rejects.toMatchObject({ message: "shipment_exceeds_batch" });
  });

  it("HACCP: CCPs need limits to be approved; approved controls are locked; only active CCPs accept readings", async () => {
    const base = { productId: null, processStep: "Pasteurisasi", hazardType: "BIOLOGICAL" as const, hazardDescription: "Patogen", severity: 5, likelihood: 3, isCcp: true, ccpCode: null, justification: null, controlMeasure: "Panaskan", criticalLimitMin: null, criticalLimitMax: null, limitUnit: null, criticalLimitText: null, monitoringProcedure: "Ukur", monitoringFrequency: "Per batch", correctiveAction: "Ulangi", verificationProcedure: null, records: null };
    const c = await createControl(qa, base);
    await expect(recordCcp(op, { haccpControlId: c.id, value: 80 })).rejects.toMatchObject({ message: "control_not_active_ccp" });
    await expect(reviewControl(qa, c.id, "APPROVE")).rejects.toMatchObject({ message: "ccp_requires_critical_limit" });
    await expect(updateControl(qa, c.id, { ...base, criticalLimitMin: 80, criticalLimitMax: 70 })).rejects.toMatchObject({ message: "critical_limit_min_gt_max" });
    await updateControl(qa, c.id, { ...base, criticalLimitMin: 72, limitUnit: "°C" });
    await reviewControl(qa, c.id, "APPROVE", "ok");
    await expect(updateControl(qa, c.id, base)).rejects.toMatchObject({ message: "control_locked" });
    const r = await recordCcp(op, { haccpControlId: c.id, value: 71.9 });
    expect(r.record.withinLimits).toBe(false);
    expect(r.deviationId).toBeTruthy();
    await expect(recordCcp(op, { haccpControlId: c.id, value: 80, recordedAt: new Date(Date.now() + 3600_000) })).rejects.toMatchObject({ message: "recorded_in_future" });
  });

  it("CAPA: due date, segregation of duties and closure rules for high severity", async () => {
    const qa2User = await makeUser(qa.orgId, "QA_MANAGER", "qa2");
    const qa2 = await ctxFor(qa.orgId, "QA_MANAGER", qa2User.id);
    const dev = await reportDeviation(op, { title: "Suhu chiller 9 C", description: "Chiller bahan baku 9 °C", severity: "HIGH", source: "MANUAL" });
    await expect(createCapa(qa, dev.id, { type: "CORRECTIVE", title: "Perbaiki", actionPlan: "Servis", assigneeId: qa.userId!, dueDate: new Date(Date.now() - 2 * 86400000) })).rejects.toMatchObject({ message: "due_date_in_past" });
    const capa = await createCapa(qa, dev.id, { type: "CORRECTIVE", title: "Servis chiller", actionPlan: "Panggil teknisi", assigneeId: qa.userId!, dueDate: new Date(Date.now() + 86400000) });
    await updateInvestigation(qa, dev.id, { rootCause: "Kompresor rusak", immediateAction: "Pindahkan bahan", disposition: "RELEASE" });
    await expect(closeDeviation(qa, dev.id, "done")).rejects.toMatchObject({ message: "open_capas_exist" });
    await expect(completeCapa(op, capa.id, "sudah")).rejects.toMatchObject({ message: "not_assignee" });
    await completeCapa(qa, capa.id, "Kompresor diganti");
    await expect(verifyCapa(qa, capa.id, true, "efektif")).rejects.toMatchObject({ message: "verifier_must_differ_from_assignee" });
    await verifyCapa(qa2, capa.id, true, "Suhu stabil 3 °C selama 3 hari");
    await closeDeviation(qa, dev.id, "Selesai");
    expect((await prisma.deviation.findUniqueOrThrow({ where: { id: dev.id } })).status).toBe("CLOSED");
  });

  it("daily alerts notify expiring certificates and overdue CAPA once (deduplicated)", async () => {
    const s = await createSupplier(qa, supplierInput("PT Gula"));
    await addCertificate(qa, s.id, { type: "HALAL", number: "H-1", issuer: "BPJPH", issuedAt: null, expiresAt: new Date(Date.now() + 5 * 86400000), documentId: null, notes: null });
    const dev = await reportDeviation(op, { title: "Dev", description: "Uji alert", severity: "LOW", source: "MANUAL" });
    const capa = await createCapa(qa, dev.id, { type: "CORRECTIVE", title: "Tindakan", actionPlan: "Lakukan", assigneeId: op.userId!, dueDate: new Date(Date.now() + 3600_000) });
    const future = new Date(Date.now() + 3 * 86400000);
    const r1 = await runDailyAlerts(future);
    const r2 = await runDailyAlerts(future);
    expect(r1.created).toBe(2);
    expect(r2.created).toBe(0);
    const n = await prisma.notification.findMany({ where: { organizationId: qa.orgId, type: { in: ["CERTIFICATE_EXPIRING", "CAPA_OVERDUE"] } } });
    expect(n.map((x) => x.type).sort()).toEqual(["CAPA_OVERDUE", "CERTIFICATE_EXPIRING"]);
    expect(n.find((x) => x.type === "CAPA_OVERDUE")?.userId).toBe(op.userId);
    void capa;
  });
});
