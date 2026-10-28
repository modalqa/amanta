/**
 * Demo seed for local development and E2E tests. Creates the same demo dataset for each
 * organization in DEMO_ORGS, plus a small second tenant so tenant isolation can be explored.
 * Each organization is skipped if its slug already exists, so new demo orgs can be added to a seeded DB. NEVER run against production (guarded below).
 * Run: npm run db:seed   (password from SEED_PASSWORD, default shown in README)
 */
import "dotenv/config";
import { prisma } from "../src/server/db/client";
import { tenantDb } from "../src/server/db/tenant";
import { hashPassword } from "../src/server/auth/password";
import { permissionsForRole, type Ctx } from "../src/server/context";
import { writeAudit } from "../src/server/audit";
import { createControl, reviewControl, createProduct, generateChecklistFromCcps } from "../src/server/services/haccp";
import { activateTemplate, createTemplate, submitChecklist, getTemplate } from "../src/server/services/checklists";
import { addCertificate, createSupplier, updateSupplier } from "../src/server/services/suppliers";
import { createBatch, createIngredient, receiveLot, setLotStatus } from "../src/server/services/traceability";
import { recordCcp } from "../src/server/services/ccp";
import { createCapa } from "../src/server/services/capa";
import type { Role } from "../src/generated/prisma/enums";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED_IN_PRODUCTION !== "true") {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

const PASSWORD = process.env.SEED_PASSWORD ?? "Amanta-Demo-2026";
const days = (n: number) => new Date(Date.now() + n * 86400000);

async function ctxFor(orgId: string, userId: string, role: Role): Promise<Ctx> {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { orgId, org: { id: o.id, name: o.name, slug: o.slug, timezone: o.timezone, locale: o.locale, dateFormat: o.dateFormat, temperatureUnit: o.temperatureUnit, weightUnit: o.weightUnit }, userId, userName: u.name, role, permissions: permissionsForRole(role), db: tenantDb(orgId), actor: { userId, ip: "seed" } };
}

async function user(email: string, name: string, hash: string) {
  return prisma.user.upsert({ where: { email }, update: {}, create: { email, name, passwordHash: hash } });
}

type DemoOrg = {
  name: string;
  slug: string;
  legalName: string | null;
  province: string | null;
  address: string | null;
  /** Fictional people; emails use the reserved .test TLD so they can never reach a real inbox. */
  people: Array<[string, string, Role]>;
};

// The first entry is what the E2E suite logs in with; keep it unchanged.
const DEMO_ORGS: DemoOrg[] = [
  {
    name: "PT Contoh Pangan Nusantara", slug: "contoh-pangan", legalName: "PT Contoh Pangan Nusantara", province: "Jawa Barat", address: "Kawasan Industri Contoh Blok A-1, Bekasi",
    people: [
      ["owner@contoh-pangan.test", "Rina Owner", "OWNER"],
      ["qa@contoh-pangan.test", "Dewi Kurniawati (QA)", "QA_MANAGER"],
      ["qa2@contoh-pangan.test", "Budi Santoso (QA)", "QA_MANAGER"],
      ["supervisor@contoh-pangan.test", "Agus Supervisor", "SUPERVISOR"],
      ["operator@contoh-pangan.test", "Siti Operator", "OPERATOR"],
      ["auditor@contoh-pangan.test", "Auditor Eksternal", "AUDITOR"],
    ],
  },
  {
    // Address and legal details are not known; left empty rather than invented.
    name: "PT RAI", slug: "pt-rai", legalName: "PT RAI", province: null, address: null,
    people: [
      ["owner@rai.test", "Owner PT RAI", "OWNER"],
      ["qa@rai.test", "QA Manager PT RAI", "QA_MANAGER"],
      ["qa2@rai.test", "QA Manager 2 PT RAI", "QA_MANAGER"],
      ["supervisor@rai.test", "Supervisor PT RAI", "SUPERVISOR"],
      ["operator@rai.test", "Operator PT RAI", "OPERATOR"],
      ["auditor@rai.test", "Auditor PT RAI", "AUDITOR"],
    ],
  },
];

/** Creates one organization with the full demo dataset. Returns false if it already exists. */
async function seedDemoOrg(spec: DemoOrg, hash: string): Promise<boolean> {
  if (await prisma.organization.findUnique({ where: { slug: spec.slug } })) {
    console.log(`Skipping ${spec.name}: organization '${spec.slug}' already exists.`);
    return false;
  }
  const org = await prisma.organization.create({ data: { name: spec.name, slug: spec.slug, legalName: spec.legalName, province: spec.province, address: spec.address } });
  const people = spec.people;
  const ids: Record<string, string> = {};
  for (const [email, name, role] of people) {
    const u = await user(email, name, hash);
    await prisma.membership.create({ data: { organizationId: org.id, userId: u.id, role } });
    ids[role === "QA_MANAGER" && ids.QA_MANAGER ? "QA2" : role] = u.id;
  }
  await writeAudit(org.id, { userId: ids.OWNER, ip: "seed" }, { action: "organization.created", entityType: "Organization", entityId: org.id, summary: "Demo organization (seed)" });
  const qa = await ctxFor(org.id, ids.QA_MANAGER, "QA_MANAGER");
  const op = await ctxFor(org.id, ids.OPERATOR, "OPERATOR");

  // Suppliers & certificates (one halal certificate expiring soon to demonstrate alerts).
  const s1 = await createSupplier(qa, { name: "CV Ayam Segar Priangan", code: "SUP-001", contactName: "Pak Hendra", email: "hendra@ayamsegar.test", phone: "+62 812-0000-0001", address: "Cianjur, Jawa Barat", status: "PENDING", riskLevel: "HIGH", notes: null });
  await addCertificate(qa, s1.id, { type: "HALAL", number: "ID32110000123450822", issuer: "BPJPH", issuedAt: days(-700), expiresAt: days(25), documentId: null, notes: "Contoh nomor – bukan sertifikat asli" });
  await addCertificate(qa, s1.id, { type: "NIB", number: "9120001234567", issuer: "OSS RBA", issuedAt: days(-900), expiresAt: null, documentId: null, notes: null });
  await updateSupplier(qa, s1.id, { name: s1.name, code: "SUP-001", contactName: "Pak Hendra", email: "hendra@ayamsegar.test", phone: "+62 812-0000-0001", address: "Cianjur, Jawa Barat", status: "APPROVED", riskLevel: "HIGH", notes: null });
  const s2 = await createSupplier(qa, { name: "PT Tepung Makmur", code: "SUP-002", contactName: "Ibu Lina", email: null, phone: null, address: "Surabaya", status: "PENDING", riskLevel: "MEDIUM", notes: null });
  await addCertificate(qa, s2.id, { type: "HALAL", number: "ID35110000987650123", issuer: "BPJPH", issuedAt: days(-200), expiresAt: days(900), documentId: null, notes: null });
  await addCertificate(qa, s2.id, { type: "SNI", number: "SPPT-SNI-3751-CONTOH", issuer: "LSPro", issuedAt: days(-400), expiresAt: days(-5), documentId: null, notes: "Kedaluwarsa – contoh peringatan" });
  await updateSupplier(qa, s2.id, { name: s2.name, code: "SUP-002", contactName: "Ibu Lina", email: null, phone: null, address: "Surabaya", status: "APPROVED", riskLevel: "MEDIUM", notes: null });

  const chicken = await createIngredient(qa, { name: "Daging ayam fillet", code: "RM-AYAM", supplierId: s1.id, allergens: [], halalCritical: true, specification: "Suhu terima ≤ 4 °C; bebas bulu & tulang", unit: "kg" });
  const flour = await createIngredient(qa, { name: "Tepung terigu", code: "RM-TPG", supplierId: s2.id, allergens: ["gluten"], halalCritical: false, specification: "Kadar air ≤ 14,5%", unit: "kg" });
  const lot1 = await receiveLot(qa, { ingredientId: chicken.id, supplierId: s1.id, lotNumber: "AYM-2610-07", receivedAt: days(-2), quantity: 800, unit: "kg", expiryDate: days(5), coaDocumentId: null, notes: null });
  const lot2 = await receiveLot(qa, { ingredientId: flour.id, supplierId: s2.id, lotNumber: "TPG-2609-31", receivedAt: days(-20), quantity: 1000, unit: "kg", expiryDate: days(300), coaDocumentId: null, notes: null });
  await setLotStatus(qa, lot1.id, "RELEASED");
  await setLotStatus(qa, lot2.id, "RELEASED");

  // HACCP plan (manual, approved by QA).
  const product = await createProduct(qa, { name: "Nugget Ayam Beku 500 g", code: "FG-NGT-500", description: "Nugget ayam berlapis tepung roti, beku", shelfLifeDays: 365, halalCertified: true, bpomNumber: "MD 000000000000 (contoh)" });
  const cooking = await createControl(qa, { productId: product.id, processStep: "Pemasakan uap", hazardType: "BIOLOGICAL", hazardDescription: "Patogen (Salmonella, Listeria) bertahan karena pemasakan kurang", severity: 5, likelihood: 3, isCcp: true, ccpCode: "CCP-1", justification: "Tahap eliminasi patogen terakhir", controlMeasure: "Suhu inti minimal 75 °C", criticalLimitMin: 75, criticalLimitMax: null, limitUnit: "°C", criticalLimitText: null, monitoringProcedure: "Ukur suhu inti 5 sampel dengan probe terkalibrasi", monitoringFrequency: "Setiap 30 menit", correctiveAction: "Tahan produk, masak ulang, verifikasi termometer", verificationProcedure: "Kalibrasi bulanan; review log harian oleh QA", records: "Log suhu pemasakan" });
  const freezing = await createControl(qa, { productId: product.id, processStep: "Pembekuan cepat (IQF)", hazardType: "BIOLOGICAL", hazardDescription: "Pertumbuhan mikroba karena pembekuan tidak cukup", severity: 3, likelihood: 2, isCcp: true, ccpCode: "CCP-2", justification: "Pengendalian pertumbuhan selama penyimpanan", controlMeasure: "Suhu inti ≤ -18 °C sebelum dikemas", criticalLimitMin: null, criticalLimitMax: -18, limitUnit: "°C", criticalLimitText: null, monitoringProcedure: "Ukur suhu inti keluar spiral freezer", monitoringFrequency: "Setiap jam", correctiveAction: "Kembalikan ke freezer, evaluasi setting", verificationProcedure: null, records: "Log IQF" });
  const metal = await createControl(qa, { productId: product.id, processStep: "Deteksi logam", hazardType: "PHYSICAL", hazardDescription: "Fragmen logam dari mesin", severity: 4, likelihood: 2, isCcp: true, ccpCode: "CCP-3", justification: null, controlMeasure: "Metal detector Fe 2,0 / Non-Fe 2,5 / SUS 3,0 mm", criticalLimitMin: null, criticalLimitMax: null, limitUnit: null, criticalLimitText: "Test piece terdeteksi & ditolak", monitoringProcedure: "Uji test piece", monitoringFrequency: "Awal shift & tiap 2 jam", correctiveAction: "Hentikan lini; periksa ulang produk sejak uji terakhir", verificationProcedure: null, records: "Log metal detector" });
  const allergen = await createControl(qa, { productId: product.id, processStep: "Pelabelan", hazardType: "ALLERGEN", hazardDescription: "Gluten/telur tidak tercantum di label", severity: 4, likelihood: 1, isCcp: false, ccpCode: null, justification: "Dikendalikan sebagai PRP", controlMeasure: "Verifikasi label setiap pergantian roll", criticalLimitMin: null, criticalLimitMax: null, limitUnit: null, criticalLimitText: null, monitoringProcedure: "Cek label", monitoringFrequency: "Setiap pergantian roll", correctiveAction: "Tahan & relabel", verificationProcedure: null, records: null });
  for (const c of [cooking, freezing, metal, allergen]) await reviewControl(qa, c.id, "APPROVE", "Ditinjau tim HACCP (seed)");

  const tpl = await generateChecklistFromCcps(qa, "Monitoring CCP – Lini Nugget");
  await activateTemplate(qa, tpl.id);
  const gmp = await createTemplate(qa, { name: "Checklist CPPOB Harian (Higiene & Sanitasi)", description: "Template contoh berdasarkan aspek umum CPPOB; sesuaikan dengan regulasi BPOM terbaru.", category: "GMP_CPPOB", frequency: "DAILY", items: [
    { prompt: "Karyawan memakai APD lengkap (penutup kepala, masker, sarung tangan)", type: "BOOLEAN", required: true },
    { prompt: "Fasilitas cuci tangan berfungsi dan tersedia sabun", type: "BOOLEAN", required: true },
    { prompt: "Tidak ada tanda hama di area produksi", type: "BOOLEAN", required: true },
    { prompt: "Suhu chiller bahan baku", type: "TEMPERATURE", required: true, maxValue: 4, unit: "°C" },
    { prompt: "Konsentrasi klorin larutan sanitasi (ppm)", type: "NUMBER", required: true, minValue: 100, maxValue: 200, unit: "ppm" },
    { prompt: "Catatan kebersihan area", type: "TEXT", required: false },
  ] });
  await activateTemplate(qa, gmp.id);

  const batch = await createBatch(qa, { batchNumber: "NGT-2610-27A", productId: product.id, productionDate: days(-1), expiryDate: days(364), quantity: 1200, unit: "kg", line: "Lini 1", notes: null, inputs: [{ lotId: lot1.id, quantity: 650, unit: "kg" }, { lotId: lot2.id, quantity: 180, unit: "kg" }] });
  for (const v of [78.2, 79.1, 76.4, 77.9]) await recordCcp(op, { haccpControlId: cooking.id, value: v, batchId: batch.id });
  for (const v of [-19.5, -20.1, -18.6]) await recordCcp(op, { haccpControlId: freezing.id, value: v, batchId: batch.id });
  // One failed reading → deviation + CAPA example.
  const out = await recordCcp(op, { haccpControlId: cooking.id, value: 72.8, batchId: batch.id, note: "Setelah pergantian kecepatan conveyor" });
  if (out.deviationId) {
    await createCapa(qa, out.deviationId, { type: "CORRECTIVE", title: "Masak ulang produk yang ditahan", actionPlan: "Masak ulang produk sejak pengukuran terakhir yang lulus; ukur ulang suhu inti.", assigneeId: ids.SUPERVISOR, dueDate: days(1) });
  }
  const t = await getTemplate(op, gmp.id);
  await submitChecklist(op, { templateId: gmp.id, shift: "Pagi", responses: t.items.map((it) => ({ itemId: it.id, valueBool: it.type === "BOOLEAN" ? true : null, valueNumber: it.type === "TEMPERATURE" ? 3.2 : it.type === "NUMBER" ? 150 : null, valueText: it.type === "TEXT" ? "Area bersih" : null })) });
  return true;
}

async function main() {
  const hash = await hashPassword(PASSWORD);
  const created = [];
  for (const spec of DEMO_ORGS) if (await seedDemoOrg(spec, hash)) created.push(spec);

  // Small second tenant (to demonstrate isolation).
  if (await prisma.organization.findUnique({ where: { slug: "sambal-lain" } })) {
    console.log("Skipping UD Sambal Lain: already exists.");
  } else {
  const other = await prisma.organization.create({ data: { name: "UD Sambal Lain", slug: "sambal-lain" } });
  const otherOwner = await user("owner@sambal-lain.test", "Pemilik Sambal", hash);
  await prisma.membership.create({ data: { organizationId: other.id, userId: otherOwner.id, role: "OWNER" } });
  const oc = await ctxFor(other.id, otherOwner.id, "OWNER");
  await createSupplier(oc, { name: "Petani Cabai Garut", code: null, contactName: null, email: null, phone: null, address: "Garut", status: "PENDING", riskLevel: "MEDIUM", notes: null });
  }

  console.log("Seed complete.");
  console.log(`Demo users (password from SEED_PASSWORD, default "${process.env.SEED_PASSWORD ? "<from env>" : PASSWORD}"):`);
  for (const spec of created) {
    console.log(`  ${spec.name}`);
    for (const [email, , role] of spec.people) console.log(`    ${role.padEnd(11)} ${email}`);
  }
  console.log("  OWNER (2nd tenant) owner@sambal-lain.test");
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
