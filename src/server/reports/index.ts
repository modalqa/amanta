import "server-only";
import ExcelJS from "exceljs";
import { ensure, type Ctx } from "../context";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { PdfReport } from "./pdf";
import { formatDate, formatDateTime, displayValue, type FormatPrefs } from "@/lib/format";
import { certificateState } from "../services/suppliers";
import { verifyAuditChain } from "../audit";
import { getT } from "@/i18n";

export type ReportFile = { bytes: Buffer; filename: string; mime: string };
export type ReportKind = "haccp-plan" | "ccp-log" | "deviations-capa" | "batch-trace" | "suppliers" | "audit-trail" | "audit-package";
export type ReportFormat = "pdf" | "csv" | "xlsx";
export type ReportParams = { from?: Date; to?: Date; batchId?: string };

const PDF = "application/pdf";
const CSV = "text/csv; charset=utf-8";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function prefs(ctx: Ctx): FormatPrefs { return { timezone: ctx.org.timezone, dateFormat: ctx.org.dateFormat, temperatureUnit: ctx.org.temperatureUnit, locale: ctx.org.locale }; }

/** CSV with formula-injection protection (cells starting with = + - @ are prefixed). */
export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): Buffer {
  const esc = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return Buffer.from("﻿" + body, "utf8");
}

async function toXlsx(sheets: Array<{ name: string; headers: string[]; rows: Array<Array<string | number | null>> }>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amanta";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.addRow(s.headers).font = { bold: true };
    for (const r of s.rows) ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v)));
    ws.columns.forEach((c) => { c.width = 22; });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function range(params: ReportParams) {
  const to = params.to ?? new Date();
  const from = params.from ?? new Date(to.getTime() - 30 * 86400000);
  if (from > to) throw new AppError("VALIDATION", "invalid_date_range");
  if (to.getTime() - from.getTime() > 400 * 86400000) throw new AppError("VALIDATION", "range_too_large");
  return { from, to };
}

const stamp = () => new Date().toISOString().slice(0, 10);

async function haccpPlan(ctx: Ctx, pdf?: PdfReport) {
  const p = prefs(ctx);
  const t = getT(ctx.org.locale);
  const controls = await ctx.db.haccpControl.findMany({ where: { status: "APPROVED" }, include: { product: { select: { name: true } } }, orderBy: [{ isCcp: "desc" }, { ccpCode: "asc" }, { processStep: "asc" }] });
  const r = pdf ?? new PdfReport(`Rencana HACCP – ${ctx.org.name}`, `Dicetak ${formatDateTime(new Date(), p)} oleh ${ctx.userName}. Hanya kendali berstatus APPROVED.`, { landscape: true });
  r.heading("Analisis bahaya & kendali (disetujui)");
  r.table([
    { header: "Kode", width: 45, get: (c: (typeof controls)[number]) => c.ccpCode ?? (c.isCcp ? "CCP" : "PRP/OPRP") },
    { header: "Produk / Tahap", width: 95, get: (c) => `${c.product?.name ? c.product.name + " – " : ""}${c.processStep}` },
    { header: "Bahaya", width: 120, get: (c) => `[${t(`hazard.${c.hazardType}`)}] ${c.hazardDescription}` },
    { header: "Risiko S×L", width: 40, get: (c) => `${c.severity}×${c.likelihood}=${c.riskScore}` },
    { header: "Tindakan pengendalian", width: 110, get: (c) => c.controlMeasure },
    { header: "Batas kritis", width: 75, get: (c) => [c.criticalLimitMin != null ? `min ${displayValue(c.criticalLimitMin, c.limitUnit, p)}` : "", c.criticalLimitMax != null ? `maks ${displayValue(c.criticalLimitMax, c.limitUnit, p)}` : "", c.criticalLimitText ?? ""].filter(Boolean).join("; ") || "–" },
    { header: "Pemantauan", width: 95, get: (c) => `${c.monitoringProcedure} (${c.monitoringFrequency})` },
    { header: "Tindakan koreksi", width: 95, get: (c) => c.correctiveAction },
    { header: "Verifikasi / Rekaman", width: 85, get: (c) => [c.verificationProcedure, c.records].filter(Boolean).join(" | ") || "–" },
  ], controls);
  return { r, count: controls.length };
}

async function deviationsCapa(ctx: Ctx, params: ReportParams) {
  const { from, to } = range(params);
  return ctx.db.deviation.findMany({ where: { createdAt: { gte: from, lte: to } }, include: { capas: true, batch: { select: { batchNumber: true } } }, orderBy: { createdAt: "asc" } });
}

async function ccpLog(ctx: Ctx, params: ReportParams) {
  const { from, to } = range(params);
  return ctx.db.ccpRecord.findMany({ where: { recordedAt: { gte: from, lte: to } }, include: { haccpControl: { select: { ccpCode: true, processStep: true, criticalLimitMin: true, criticalLimitMax: true, limitUnit: true } }, batch: { select: { batchNumber: true } } }, orderBy: { recordedAt: "asc" }, take: 20000 });
}

export async function generateReport(ctx: Ctx, kind: ReportKind, format: ReportFormat, params: ReportParams = {}): Promise<ReportFile> {
  ensure(ctx, "reports:read");
  const p = prefs(ctx);
  const t = getT(ctx.org.locale);
  const slug = ctx.org.slug;
  let file: ReportFile;
  switch (kind) {
    case "haccp-plan": {
      if (format !== "pdf") throw new AppError("VALIDATION", "unsupported_format");
      const { r } = await haccpPlan(ctx);
      file = { bytes: await r.finish(`${ctx.org.name} – Rencana HACCP`), filename: `${slug}-haccp-plan-${stamp()}.pdf`, mime: PDF };
      break;
    }
    case "ccp-log": {
      const rows = await ccpLog(ctx, params);
      if (format === "csv") {
        file = { bytes: toCsv(["recorded_at", "ccp", "process_step", "value", "unit", "min", "max", "within_limits", "batch", "source"], rows.map((x) => [x.recordedAt.toISOString(), x.haccpControl.ccpCode, x.haccpControl.processStep, x.value, x.unit, x.haccpControl.criticalLimitMin, x.haccpControl.criticalLimitMax, x.withinLimits ? "yes" : "no", x.batch?.batchNumber, x.source])), filename: `${slug}-ccp-log-${stamp()}.csv`, mime: CSV };
      } else if (format === "pdf") {
        const { from, to } = range(params);
        const r = new PdfReport(`Log Pemantauan CCP – ${ctx.org.name}`, `Periode ${formatDate(from, p)} – ${formatDate(to, p)}. ${rows.length} catatan, ${rows.filter((x) => !x.withinLimits).length} di luar batas.`);
        r.table([
          { header: "Waktu", width: 90, get: (x: (typeof rows)[number]) => formatDateTime(x.recordedAt, p) },
          { header: "CCP", width: 60, get: (x) => x.haccpControl.ccpCode ?? "" },
          { header: "Tahap", width: 110, get: (x) => x.haccpControl.processStep },
          { header: "Nilai", width: 60, get: (x) => displayValue(x.value, x.unit, p) },
          { header: "Batas", width: 80, get: (x) => `${displayValue(x.haccpControl.criticalLimitMin, x.unit, p)} – ${displayValue(x.haccpControl.criticalLimitMax, x.unit, p)}` },
          { header: "Status", width: 50, get: (x) => (x.withinLimits ? "OK" : "DI LUAR") },
          { header: "Batch", width: 65, get: (x) => x.batch?.batchNumber ?? "–" },
        ], rows);
        file = { bytes: await r.finish(`${ctx.org.name} – Log CCP`), filename: `${slug}-ccp-log-${stamp()}.pdf`, mime: PDF };
      } else throw new AppError("VALIDATION", "unsupported_format");
      break;
    }
    case "deviations-capa": {
      const devs = await deviationsCapa(ctx, params);
      if (format === "xlsx") {
        file = {
          bytes: await toXlsx([
            { name: "Deviasi", headers: ["Kode", "Judul", "Tingkat", "Sumber", "Status", "Disposisi", "Batch", "Terjadi", "Akar masalah", "Ditutup"], rows: devs.map((d) => [d.code, d.title, d.severity, d.source, d.status, d.disposition, d.batch?.batchNumber ?? null, formatDateTime(d.occurredAt, p), d.rootCause, d.closedAt ? formatDateTime(d.closedAt, p) : null]) },
            { name: "CAPA", headers: ["Kode", "Deviasi", "Jenis", "Judul", "Status", "Tenggat", "Selesai", "Efektif", "Catatan verifikasi"], rows: devs.flatMap((d) => d.capas.map((c) => [c.code, d.code, c.type, c.title, c.status, formatDate(c.dueDate, p), c.completedAt ? formatDate(c.completedAt, p) : null, c.effective === null ? null : c.effective ? "Ya" : "Tidak", c.verificationNote])) },
          ]),
          filename: `${slug}-deviations-capa-${stamp()}.xlsx`, mime: XLSX,
        };
      } else if (format === "pdf") {
        const { from, to } = range(params);
        const r = new PdfReport(`Register Deviasi & CAPA – ${ctx.org.name}`, `Periode ${formatDate(from, p)} – ${formatDate(to, p)}. ${devs.length} deviasi.`, { landscape: true });
        r.table([
          { header: "Kode", width: 70, get: (d: (typeof devs)[number]) => d.code },
          { header: "Judul", width: 170, get: (d) => d.title },
          { header: "Tingkat", width: 50, get: (d) => t(`severity.${d.severity}`) },
          { header: "Status", width: 75, get: (d) => t(`devStatus.${d.status}`) },
          { header: "Disposisi", width: 55, get: (d) => t(`disposition.${d.disposition}`) },
          { header: "Akar masalah", width: 160, get: (d) => d.rootCause ?? "–" },
          { header: "CAPA", width: 180, get: (d) => d.capas.map((c) => `${c.code} ${t(`capaStatus.${c.status}`)}${c.effective ? ` (${t("capa.effective")})` : ""}`).join("; ") || "–" },
        ], devs);
        file = { bytes: await r.finish(`${ctx.org.name} – Deviasi & CAPA`), filename: `${slug}-deviations-capa-${stamp()}.pdf`, mime: PDF };
      } else throw new AppError("VALIDATION", "unsupported_format");
      break;
    }
    case "batch-trace": {
      if (!params.batchId) throw new AppError("VALIDATION", "batch_required");
      const b = await ctx.db.batch.findUnique({ where: { id: params.batchId }, include: { product: true, inputs: { include: { lot: { include: { ingredient: true, supplier: { include: { certificates: true } } } } } }, shipments: true, ccpRecords: { include: { haccpControl: { select: { ccpCode: true, processStep: true } } }, orderBy: { recordedAt: "asc" } }, submissions: { include: { template: { select: { name: true } } } }, deviations: { include: { capas: true } } } });
      if (!b) throw new AppError("NOT_FOUND", "batch_not_found");
      const r = new PdfReport(`Laporan Ketertelusuran Batch ${b.batchNumber}`, `${ctx.org.name} – dicetak ${formatDateTime(new Date(), p)}`);
      r.keyValues([["Produk", b.product.name], ["Tanggal produksi", formatDate(b.productionDate, p)], ["Kedaluwarsa", formatDate(b.expiryDate, p)], ["Jumlah", `${b.quantity} ${b.unit}`], ["Lini", b.line ?? "–"], ["Status", t(`batchStatus.${b.status}`)], ["No. izin edar", b.product.bpomNumber ?? "–"]]);
      r.heading("Telusur balik: bahan baku");
      r.table([
        { header: "Bahan", width: 110, get: (i: (typeof b.inputs)[number]) => i.lot.ingredient.name },
        { header: "Lot", width: 80, get: (i) => i.lot.lotNumber },
        { header: "Pemasok", width: 110, get: (i) => i.lot.supplier?.name ?? "–" },
        { header: "Diterima", width: 70, get: (i) => formatDate(i.lot.receivedAt, p) },
        { header: "Jumlah", width: 60, get: (i) => `${i.quantity} ${i.unit}` },
        { header: "Halal", width: 85, get: (i) => { const h = i.lot.supplier?.certificates.find((c) => c.type === "HALAL"); return h ? `${h.number} (${certificateState(h.expiresAt, b.productionDate)})` : i.lot.ingredient.halalCritical ? "TIDAK ADA" : "n/a"; } },
      ], b.inputs);
      r.heading("Pemantauan CCP");
      r.table([
        { header: "Waktu", width: 100, get: (x: (typeof b.ccpRecords)[number]) => formatDateTime(x.recordedAt, p) },
        { header: "CCP", width: 70, get: (x) => x.haccpControl.ccpCode ?? "" },
        { header: "Tahap", width: 150, get: (x) => x.haccpControl.processStep },
        { header: "Nilai", width: 80, get: (x) => displayValue(x.value, x.unit, p) },
        { header: "Status", width: 80, get: (x) => (x.withinLimits ? "OK" : "DI LUAR BATAS") },
      ], b.ccpRecords);
      r.heading("Checklist");
      r.table([
        { header: "Waktu", width: 110, get: (s: (typeof b.submissions)[number]) => formatDateTime(s.submittedAt, p) },
        { header: "Checklist", width: 250, get: (s) => s.template.name },
        { header: "Hasil", width: 100, get: (s) => `${t(`subStatus.${s.status}`)}${s.failedCount ? ` (${s.failedCount})` : ""}` },
      ], b.submissions);
      r.heading("Deviasi & CAPA");
      r.table([
        { header: "Kode", width: 80, get: (d: (typeof b.deviations)[number]) => d.code },
        { header: "Judul", width: 200, get: (d) => d.title },
        { header: "Status / disposisi", width: 110, get: (d) => `${t(`devStatus.${d.status}`)} / ${t(`disposition.${d.disposition}`)}` },
        { header: "CAPA", width: 125, get: (d) => d.capas.map((c) => `${c.code} ${t(`capaStatus.${c.status}`)}`).join("; ") || "–" },
      ], b.deviations);
      r.heading("Telusur maju: pengiriman");
      r.table([
        { header: "Tanggal", width: 90, get: (s: (typeof b.shipments)[number]) => formatDate(s.shippedAt, p) },
        { header: "Pelanggan", width: 170, get: (s) => s.customer },
        { header: "Tujuan", width: 150, get: (s) => s.destination ?? "–" },
        { header: "Jumlah", width: 105, get: (s) => `${s.quantity} ${s.unit}` },
      ], b.shipments);
      file = { bytes: await r.finish(`${ctx.org.name} – Batch ${b.batchNumber}`), filename: `${slug}-batch-${b.batchNumber.replace(/[^a-zA-Z0-9-]/g, "_")}-${stamp()}.pdf`, mime: PDF };
      break;
    }
    case "suppliers": {
      const certs = await ctx.db.supplierCertificate.findMany({ include: { supplier: true }, orderBy: [{ supplier: { name: "asc" } }, { expiresAt: "asc" }] });
      const rows = certs.map((c) => [c.supplier.name, c.supplier.status, c.type, c.number, c.issuer, c.issuedAt ? formatDate(c.issuedAt, p) : null, c.expiresAt ? formatDate(c.expiresAt, p) : null, certificateState(c.expiresAt)]);
      const headers = ["Pemasok", "Status pemasok", "Jenis sertifikat", "Nomor", "Penerbit", "Terbit", "Berlaku s/d", "Status"];
      if (format === "xlsx") file = { bytes: await toXlsx([{ name: "Sertifikat", headers, rows }]), filename: `${slug}-supplier-certificates-${stamp()}.xlsx`, mime: XLSX };
      else if (format === "csv") file = { bytes: toCsv(headers, rows), filename: `${slug}-supplier-certificates-${stamp()}.csv`, mime: CSV };
      else throw new AppError("VALIDATION", "unsupported_format");
      break;
    }
    case "audit-trail": {
      ensure(ctx, "audit:read");
      if (format !== "csv") throw new AppError("VALIDATION", "unsupported_format");
      const { from, to } = range(params);
      const logs = await ctx.db.auditLog.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { seq: "asc" }, take: 50000 });
      file = { bytes: toCsv(["seq", "timestamp", "actor_user_id", "actor_api_key_id", "action", "entity_type", "entity_id", "summary", "ip", "hash", "prev_hash"], logs.map((l) => [l.seq, l.createdAt.toISOString(), l.actorUserId, l.actorApiKeyId, l.action, l.entityType, l.entityId, l.summary, l.ipAddress, l.hash, l.prevHash])), filename: `${slug}-audit-trail-${stamp()}.csv`, mime: CSV };
      break;
    }
    case "audit-package": {
      if (format !== "pdf") throw new AppError("VALIDATION", "unsupported_format");
      const { from, to } = range(params);
      const r = new PdfReport(`Paket Audit Keamanan Pangan – ${ctx.org.name}`, `Periode ${formatDate(from, p)} – ${formatDate(to, p)}. Dibuat ${formatDateTime(new Date(), p)} oleh ${ctx.userName}.`, { landscape: true });
      const [records, devs, certs, subs, chain] = await Promise.all([ccpLog(ctx, { from, to }), deviationsCapa(ctx, { from, to }), ctx.db.supplierCertificate.findMany({ include: { supplier: { select: { name: true } } } }), ctx.db.checklistSubmission.count({ where: { submittedAt: { gte: from, lte: to } } }), verifyAuditChain(ctx.orgId)]);
      const out = records.filter((x) => !x.withinLimits).length;
      r.heading("Ringkasan");
      r.keyValues([
        ["Catatan CCP", `${records.length} (${out} di luar batas; kepatuhan ${records.length ? Math.round(((records.length - out) / records.length) * 1000) / 10 : 0}%)`],
        ["Checklist terisi", String(subs)],
        ["Deviasi", `${devs.length} (${devs.filter((d) => d.status === "CLOSED").length} ditutup)`],
        ["CAPA", `${devs.reduce((a, d) => a + d.capas.length, 0)} (${devs.reduce((a, d) => a + d.capas.filter((c) => c.status === "CLOSED").length, 0)} terverifikasi efektif)`],
        ["Sertifikat pemasok kedaluwarsa", String(certs.filter((c) => certificateState(c.expiresAt) === "EXPIRED").length)],
        ["Integritas jejak audit", chain.ok ? `OK (${chain.checked} entri terverifikasi)` : `RUSAK pada entri #${chain.brokenAtSeq}`],
      ]);
      r.paragraph("Catatan: laporan ini disusun dari catatan sistem. Kesesuaian terhadap standar/regulasi tertentu (mis. CPPOB BPOM, SNI CAC/RCP 1, Sistem Jaminan Produk Halal) harus dinilai oleh personel yang kompeten.", 8);
      await haccpPlan(ctx, r);
      r.heading("Deviasi & CAPA");
      r.table([
        { header: "Kode", width: 70, get: (d: (typeof devs)[number]) => d.code },
        { header: "Judul", width: 220, get: (d) => d.title },
        { header: "Tingkat", width: 55, get: (d) => t(`severity.${d.severity}`) },
        { header: "Status", width: 80, get: (d) => t(`devStatus.${d.status}`) },
        { header: "CAPA", width: 335, get: (d) => d.capas.map((c) => `${c.code} ${t(`capaStatus.${c.status}`)}`).join("; ") || "–" },
      ], devs);
      r.heading("Sertifikat pemasok");
      r.table([
        { header: "Pemasok", width: 200, get: (c: (typeof certs)[number]) => c.supplier.name },
        { header: "Jenis", width: 90, get: (c) => t(`certType.${c.type}`) },
        { header: "Nomor", width: 170, get: (c) => c.number },
        { header: "Berlaku s/d", width: 150, get: (c) => formatDate(c.expiresAt, p) },
        { header: "Status", width: 150, get: (c) => t(`certState.${certificateState(c.expiresAt)}`) },
      ], certs);
      file = { bytes: await r.finish(`${ctx.org.name} – Paket audit`), filename: `${slug}-audit-package-${stamp()}.pdf`, mime: PDF };
      break;
    }
    default:
      throw new AppError("VALIDATION", "unknown_report");
  }
  await writeAudit(ctx.orgId, ctx.actor, { action: "report.generated", entityType: "Report", entityId: kind, metadata: { format, from: params.from?.toISOString() ?? null, to: params.to?.toISOString() ?? null, batchId: params.batchId ?? null, bytes: file.bytes.length } });
  return file;
}
