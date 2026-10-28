import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Local OpenAI-compatible stub used ONLY by automated tests. It lets tests exercise the real
 * HTTP provider code path without an external API key. It is never used by the application.
 */
export const STUB_HACCP = {
  summary: "Proses nugget ayam beku: penerimaan, penggilingan, pelapisan, penggorengan awal, pemasakan uap, IQF, pengemasan + deteksi logam, penyimpanan beku.",
  products: [{ name: "Nugget Ayam Beku", description: "Nugget ayam berlapis tepung roti, dibekukan" }],
  controls: [
    { productName: "Nugget Ayam Beku", processStep: "Penerimaan daging ayam", hazardType: "BIOLOGICAL", hazardDescription: "Pertumbuhan patogen (Salmonella) akibat suhu penerimaan tinggi", severity: 4, likelihood: 3, isCcp: false, controlMeasure: "Verifikasi suhu ≤ 4 °C dan sertifikat pemasok", limitUnit: "°C", criticalLimitMax: 4, monitoringProcedure: "Ukur suhu setiap kedatangan", monitoringFrequency: "Setiap kedatangan", correctiveAction: "Tolak bahan > 4 °C", records: "Form penerimaan" },
    { productName: "Nugget Ayam Beku", processStep: "Penerimaan daging ayam", hazardType: "HALAL", hazardDescription: "Daging tidak berasal dari pemasok bersertifikat halal", severity: 5, likelihood: 2, isCcp: true, justification: "Titik kritis halal: tidak ada tahap lanjutan yang dapat menghilangkan risiko", controlMeasure: "Hanya terima dari pemasok dengan sertifikat halal BPJPH yang berlaku", criticalLimitText: "Sertifikat halal valid untuk setiap lot", monitoringProcedure: "Cek sertifikat halal & label setiap lot", monitoringFrequency: "Setiap lot", correctiveAction: "Tolak lot, laporkan ke Tim Halal", verificationProcedure: "Review mingguan oleh Penyelia Halal", records: "Daftar bahan & sertifikat halal" },
    { productName: "Nugget Ayam Beku", processStep: "Pemasakan uap", hazardType: "BIOLOGICAL", hazardDescription: "Kelangsungan hidup Salmonella/Listeria karena pemasakan tidak cukup", severity: 5, likelihood: 3, isCcp: true, justification: "Tahap terakhir yang mengeliminasi patogen", controlMeasure: "Pemasakan hingga suhu inti minimal 75 °C", criticalLimitMin: 75, limitUnit: "°C", monitoringProcedure: "Ukur suhu inti 5 sampel dengan probe terkalibrasi", monitoringFrequency: "Setiap 30 menit", correctiveAction: "Tahan produk, masak ulang, verifikasi termometer", verificationProcedure: "Kalibrasi termometer bulanan; review rekaman harian", records: "Log suhu pemasakan" },
    { productName: "Nugget Ayam Beku", processStep: "Pengemasan & deteksi logam", hazardType: "PHYSICAL", hazardDescription: "Kontaminasi fragmen logam dari mesin penggiling", severity: 4, likelihood: 2, isCcp: true, justification: "Deteksi logam adalah tahap terakhir untuk menghilangkan bahaya fisik", controlMeasure: "Metal detector Fe 2,0 / Non-Fe 2,5 / SUS 3,0 mm", criticalLimitText: "Tidak ada logam ≥ Fe 2,0 mm; Non-Fe 2,5 mm; SUS 3,0 mm", monitoringProcedure: "Uji test piece", monitoringFrequency: "Awal shift dan setiap 2 jam", correctiveAction: "Hentikan lini, periksa ulang produk sejak uji terakhir yang lulus", records: "Log metal detector" },
    { productName: "Nugget Ayam Beku", processStep: "Pelapisan (breading)", hazardType: "ALLERGEN", hazardDescription: "Gluten dan telur tidak dicantumkan pada label", severity: 4, likelihood: 2, isCcp: false, controlMeasure: "Verifikasi label alergen setiap pergantian kemasan", monitoringProcedure: "Cek label", monitoringFrequency: "Setiap pergantian roll kemasan", correctiveAction: "Tahan dan relabel" },
  ],
  checklist: {
    name: "Checklist Shift Produksi Nugget",
    frequency: "PER_SHIFT",
    items: [
      { prompt: "Suhu inti nugget setelah pemasakan", type: "TEMPERATURE", minValue: 75, unit: "°C", ccpProcessStep: "Pemasakan uap" },
      { prompt: "Test piece metal detector terdeteksi dan ditolak", type: "BOOLEAN", ccpProcessStep: "Pengemasan & deteksi logam" },
      { prompt: "Suhu adonan setelah pencampuran", type: "TEMPERATURE", maxValue: 10, unit: "°C" },
      { prompt: "Sertifikat halal lot daging tersedia dan berlaku", type: "BOOLEAN" },
      { prompt: "Catatan operator", type: "TEXT" },
    ],
  },
  warnings: ["Batas kritis suhu penerimaan tidak ditetapkan sebagai CCP; verifikasi oleh tim HACCP."],
};

export const STUB_CAPA = {
  rootCauseAnalysis: "5 Whys: suhu inti < 75 °C → waktu tinggal steam cooker terlalu singkat → kecepatan conveyor dinaikkan tanpa validasi → tidak ada kontrol perubahan parameter.",
  corrective: [{ title: "Masak ulang dan uji ulang produk yang ditahan", actionPlan: "Masak ulang batch yang ditahan hingga suhu inti ≥ 75 °C dan dokumentasikan.", dueInDays: 1 }],
  preventive: [{ title: "Kunci parameter kecepatan conveyor", actionPlan: "Tambahkan prosedur kontrol perubahan dan proteksi password pada HMI.", dueInDays: 14 }],
  warnings: [],
};

export async function startAiStub(port = 0): Promise<{ url: string; server: Server; calls: Array<{ auth?: string; body: unknown }> }> {
  const calls: Array<{ auth?: string; body: unknown }> = [];
  const server = createServer((req, res) => {
    if (req.url === "/health") { res.writeHead(200).end("ok"); return; }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ auth: req.headers.authorization, body });
      if (req.url !== "/v1/chat/completions") { res.writeHead(404).end(); return; }
      const user = JSON.stringify(body.messages ?? "");
      const content = user.includes("<deviation>") ? STUB_CAPA : user.includes("operational checklist") ? { ...STUB_HACCP.checklist, name: "Checklist dari SOP", warnings: [] } : STUB_HACCP;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "stub", model: "stub-model", choices: [{ message: { role: "assistant", content: "```json\n" + JSON.stringify(content) + "\n```" } }], usage: { prompt_tokens: 1234, completion_tokens: 567 } }));
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, server, calls };
}
