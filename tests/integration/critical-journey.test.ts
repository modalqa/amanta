import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resetDb, makeOrg, ctxFor, makeUser } from "../helpers/db";
import { startAiStub } from "../helpers/ai-stub";
import { prisma } from "@/server/db/client";
import { setInlineJobRunner } from "@/server/jobs/queue";
import { HANDLERS } from "@/server/jobs/handlers";
import { setAiProviderForTesting } from "@/server/ai";
import { OpenAiCompatibleProvider } from "@/server/ai/providers";
import { uploadDocument, requestDocumentAi, readDocumentFile } from "@/server/services/documents";
import { listControls, reviewControl, updateControl, getControl } from "@/server/services/haccp";
import { activateTemplate, getTemplate, listTemplates, submitChecklist } from "@/server/services/checklists";
import { recordCcp } from "@/server/services/ccp";
import { closeDeviation, getDeviation, requestCapaDraft, updateInvestigation } from "@/server/services/deviations";
import { acceptCapaDraft, completeCapa, verifyCapa } from "@/server/services/capa";
import { createProduct } from "@/server/services/haccp";
import { createBatch } from "@/server/services/traceability";
import { generateReport } from "@/server/reports";
import { getDashboard } from "@/server/services/dashboard";
import { verifyAuditChain } from "@/server/audit";
import type { Server } from "node:http";

let stub: { url: string; server: Server; calls: Array<{ auth?: string; body: unknown }> };

beforeAll(async () => {
  stub = await startAiStub();
  setInlineJobRunner(async (queue, data) => {
    await (HANDLERS as Record<string, (d: never) => Promise<unknown>>)[queue](data as never);
  });
});
afterAll(async () => {
  setInlineJobRunner(undefined);
  setAiProviderForTesting(undefined);
  stub.server.close();
  await rm("./storage-test", { recursive: true, force: true });
});
beforeEach(async () => {
  await resetDb();
  setAiProviderForTesting(new OpenAiCompatibleProvider("test-key", "stub-model", stub.url, 10_000));
});

describe("critical journey: document → AI draft → review → checklist → deviation → CAPA → report", () => {
  it("runs end to end with real persistence", async () => {
    const org = await makeOrg("PT Contoh Pangan");
    const qa = await ctxFor(org.id, "QA_MANAGER");
    const qa2User = await makeUser(org.id, "QA_MANAGER", "qa-lead");
    const qa2 = await ctxFor(org.id, "QA_MANAGER", qa2User.id);
    const operator = await ctxFor(org.id, "OPERATOR");

    // 1. Upload SOP → extraction job runs → text stored.
    const bytes = readFileSync("tests/fixtures/sop-nugget-ayam.txt");
    const doc = await uploadDocument(qa, { title: "SOP Produksi Nugget", category: "SOP" }, { name: "sop-nugget.txt", bytes });
    const extracted = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(extracted.status).toBe("EXTRACTED");
    expect(extracted.extractedText).toContain("suhu inti minimal 75");
    const file = await readDocumentFile(qa, doc.id);
    expect(file.bytes.equals(bytes)).toBe(true);

    // 2. AI HACCP draft via the OpenAI-compatible provider (local stub over HTTP).
    const run = await requestDocumentAi(qa, doc.id, "HACCP_FROM_DOCUMENT");
    const finished = await prisma.aiRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.inputTokens).toBe(1234);
    expect(stub.calls.at(-1)?.auth).toBe("Bearer test-key");
    const drafts = await listControls(qa, { status: "DRAFT" });
    expect(drafts).toHaveLength(5);
    expect(drafts.every((c) => c.source === "AI")).toBe(true);
    // AI-generated checklist is a DRAFT and cannot be used yet.
    const [tplDraft] = await listTemplates(qa, "DRAFT");
    await expect(submitChecklist(operator, { templateId: tplDraft.id, responses: [] })).rejects.toMatchObject({ code: "INVALID_STATE" });

    // 3. Human review: operator cannot approve; checklist cannot activate before controls approved.
    const cooking = drafts.find((c) => c.processStep === "Pemasakan uap")!;
    await expect(reviewControl(operator, cooking.id, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(activateTemplate(qa, tplDraft.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    // Edit before approval (reviewer tightens wording), then approve all CCPs and reject one non-CCP.
    const c = await getControl(qa, cooking.id);
    await updateControl(qa, cooking.id, { ...c, productId: c.productId, verificationProcedure: "Kalibrasi termometer bulanan (diverifikasi QA)", isCcp: true } as never);
    for (const d of drafts) {
      if (d.isCcp) await reviewControl(qa, d.id, "APPROVE", "Ditinjau tim HACCP");
    }
    const allergen = drafts.find((d) => d.hazardType === "ALLERGEN")!;
    await expect(reviewControl(qa, allergen.id, "REJECT")).rejects.toMatchObject({ code: "VALIDATION" });
    await reviewControl(qa, allergen.id, "REJECT", "Dikelola sebagai PRP label");
    await activateTemplate(qa, tplDraft.id);
    const tpl = await getTemplate(qa, tplDraft.id);
    expect(tpl.status).toBe("ACTIVE");

    // 4. Production batch + checklist execution with a failed CCP reading (70 °C < 75 °C).
    const product = (await prisma.product.findFirst({ where: { organizationId: org.id, name: "Nugget Ayam Beku" } })) ?? (await createProduct(qa, { name: "Nugget Ayam Beku", code: null, description: null, shelfLifeDays: 365, halalCertified: true, bpomNumber: null }));
    const batch = await createBatch(qa, { batchNumber: "NGT-2610-01", productId: product.id, productionDate: new Date(), expiryDate: null, quantity: 500, unit: "kg", line: "Lini 1", notes: null, inputs: [] });
    const resp = tpl.items.map((it) => ({
      itemId: it.id,
      valueNumber: it.type === "TEMPERATURE" ? (it.prompt.includes("inti") ? 70 : 8) : null,
      valueBool: it.type === "BOOLEAN" ? true : null,
      valueText: it.type === "TEXT" ? "Shift pagi normal" : null,
    }));
    const { submission, deviationId } = await submitChecklist(operator, { templateId: tpl.id, batchId: batch.id, shift: "Pagi", responses: resp });
    expect(submission.status).toBe("FAILED");
    expect(deviationId).toBeTruthy();
    const ccpRecords = await prisma.ccpRecord.findMany({ where: { organizationId: org.id } });
    expect(ccpRecords).toHaveLength(1);
    expect(ccpRecords[0].withinLimits).toBe(false);
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe("ON_HOLD");

    // Manual CCP reading within limits creates no deviation.
    const ok = await recordCcp(operator, { haccpControlId: cooking.id, value: 78.5, batchId: batch.id });
    expect(ok.deviationId).toBeNull();

    // 5. Deviation → AI CAPA draft → accept → work → verify (segregation of duties) → close.
    const dev = await getDeviation(qa, deviationId!);
    expect(dev.severity).toBe("HIGH");
    expect(dev.source).toBe("CCP");
    const capaRun = await requestCapaDraft(qa, dev.id);
    const capaRunDone = await prisma.aiRun.findUniqueOrThrow({ where: { id: capaRun.id } });
    expect(capaRunDone.status).toBe("SUCCEEDED");
    const capas = await acceptCapaDraft(qa, capaRun.id, operator.userId!, [0, 1]);
    expect(capas).toHaveLength(2);
    expect((await getDeviation(qa, dev.id)).status).toBe("CAPA_IN_PROGRESS");
    await expect(closeDeviation(qa, dev.id, "selesai")).rejects.toMatchObject({ code: "VALIDATION" }); // disposition HOLD
    await updateInvestigation(qa, dev.id, { rootCause: "Kecepatan conveyor dinaikkan tanpa validasi", immediateAction: "Produk ditahan & dimasak ulang", disposition: "REWORK" });
    await expect(closeDeviation(qa, dev.id, "selesai")).rejects.toMatchObject({ code: "INVALID_STATE" }); // open CAPAs
    for (const capa of capas) {
      await completeCapa(operator, capa.id, "Sudah dilaksanakan, bukti terlampir");
      await expect(verifyCapa(operator, capa.id, true, "ok")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // qa created + verifies; the assignee (operator) is not the verifier.
    await verifyCapa(qa2, capas[0].id, false, "Belum efektif: suhu masih rendah di sampel ulang");
    await completeCapa(operator, capas[0].id, "Pemasakan ulang ke-2, suhu 80 °C");
    await verifyCapa(qa2, capas[0].id, true, "Efektif: 5 sampel ≥ 77 °C");
    await verifyCapa(qa2, capas[1].id, true, "Parameter HMI terkunci, diverifikasi");
    const closed = await closeDeviation(qa, dev.id, "CAPA efektif; produk dimasak ulang dan lulus uji");
    expect(closed.status).toBe("CLOSED");

    // 6. Dashboard & reports from real data.
    const dash = await getDashboard(qa);
    expect(dash.ccpRecords7d).toBe(2);
    expect(dash.ccpCompliance7d).toBe(50);
    expect(dash.openDeviations).toBe(0);
    const plan = await generateReport(qa, "haccp-plan", "pdf");
    expect(plan.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const trace = await generateReport(qa, "batch-trace", "pdf", { batchId: batch.id });
    expect(trace.bytes.length).toBeGreaterThan(1000);
    const register = await generateReport(qa, "deviations-capa", "xlsx");
    expect(register.bytes.subarray(0, 2).toString()).toBe("PK");
    const csv = (await generateReport(qa, "ccp-log", "csv")).bytes.toString("utf8");
    expect(csv).toContain("78.5");
    const pkg = await generateReport(qa, "audit-package", "pdf");
    expect(pkg.bytes.subarray(0, 5).toString()).toBe("%PDF-");

    // 7. Audit trail is complete and its hash chain verifies.
    const actions = (await prisma.auditLog.findMany({ where: { organizationId: org.id }, orderBy: { seq: "asc" } })).map((a) => a.action);
    for (const a of ["document.uploaded", "document.extracted", "ai.haccp_drafted", "haccp.control_approved", "checklist.template_activated", "checklist.submitted", "deviation.opened", "capa.created", "capa.verified_ineffective", "capa.verified_effective", "deviation.closed", "report.generated"]) {
      expect(actions).toContain(a);
    }
    expect(await verifyAuditChain(org.id)).toMatchObject({ ok: true });
  });

  it("reports a clear failure state when AI is not configured", async () => {
    setAiProviderForTesting(null);
    const org = await makeOrg();
    const qa = await ctxFor(org.id, "QA_MANAGER");
    const doc = await uploadDocument(qa, { title: "SOP", category: "SOP" }, { name: "sop.txt", bytes: readFileSync("tests/fixtures/sop-nugget-ayam.txt") });
    const run = await requestDocumentAi(qa, doc.id, "HACCP_FROM_DOCUMENT");
    const r = await prisma.aiRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(r.status).toBe("FAILED");
    expect(r.errorCode).toBe("AI_NOT_CONFIGURED");
    expect(await prisma.haccpControl.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("rejects AI output that does not match the schema", async () => {
    setAiProviderForTesting({ name: "bad", model: "bad", generateJson: async () => { const { haccpDraftSchema } = await import("@/server/ai/prompts"); haccpDraftSchema.parse({ controls: [] }); throw new Error("unreachable"); } });
    const org = await makeOrg();
    const qa = await ctxFor(org.id, "QA_MANAGER");
    const doc = await uploadDocument(qa, { title: "SOP", category: "SOP" }, { name: "sop.txt", bytes: Buffer.from("SOP singkat pemasakan 75 C") });
    const run = await requestDocumentAi(qa, doc.id, "HACCP_FROM_DOCUMENT");
    expect((await prisma.aiRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("FAILED");
  });
});
