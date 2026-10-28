import "server-only";
import type { ValidatedFile } from "./filetype";

export type Extracted = { text: string; pageCount?: number; warnings: string[] };

const MAX_CHARS = 500_000;

/** Extracts plain text from supported documents. Runs in the worker, never in the request path. */
export async function extractText(buf: Buffer, kind: ValidatedFile["kind"]): Promise<Extracted> {
  const warnings: string[] = [];
  let text = "";
  let pageCount: number | undefined;
  switch (kind) {
    case "pdf": {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const res = await pdfText(pdf, { mergePages: false });
      pageCount = res.totalPages;
      text = (res.text as string[]).map((t, i) => `--- Halaman ${i + 1} ---\n${t}`).join("\n\n");
      if (text.replace(/--- Halaman \d+ ---/g, "").trim().length < 20) warnings.push("pdf_no_text_layer");
      break;
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer: buf });
      text = res.value;
      break;
    }
    case "xlsx": {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const parts: string[] = [];
      wb.eachSheet((ws) => {
        parts.push(`--- Sheet: ${ws.name} ---`);
        ws.eachRow((row) => {
          const vals = (row.values as unknown[]).slice(1).map((v) => {
            if (v === null || v === undefined) return "";
            if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text);
            if (typeof v === "object" && v !== null && "result" in v) return String((v as { result: unknown }).result);
            if (v instanceof Date) return v.toISOString().slice(0, 10);
            return String(v);
          });
          parts.push(vals.join(" | "));
        });
      });
      text = parts.join("\n");
      break;
    }
    case "text":
      text = buf.toString("utf8");
      break;
    case "image":
      warnings.push("image_ocr_not_supported");
      text = "";
      break;
  }
  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n");
  if (text.length > MAX_CHARS) { text = text.slice(0, MAX_CHARS); warnings.push("text_truncated"); }
  return { text, pageCount, warnings };
}
