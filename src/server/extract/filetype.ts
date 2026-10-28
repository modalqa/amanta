import "server-only";
import { fileTypeFromBuffer } from "file-type";
import { AppError } from "../errors";

export const ALLOWED: Record<string, { mime: string; exts: string[]; kind: "pdf" | "docx" | "xlsx" | "text" | "image" }> = {
  pdf: { mime: "application/pdf", exts: ["pdf"], kind: "pdf" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", exts: ["docx"], kind: "docx" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", exts: ["xlsx"], kind: "xlsx" },
  png: { mime: "image/png", exts: ["png"], kind: "image" },
  jpg: { mime: "image/jpeg", exts: ["jpg", "jpeg"], kind: "image" },
  txt: { mime: "text/plain", exts: ["txt", "md"], kind: "text" },
  csv: { mime: "text/csv", exts: ["csv"], kind: "text" },
};

export type ValidatedFile = { mime: string; ext: string; kind: "pdf" | "docx" | "xlsx" | "text" | "image" };

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/\s+/g, " ").trim().slice(0, 150) || "file";
}

/**
 * Validates an upload by magic bytes (not the client-provided MIME type) and checks the
 * extension matches the detected content. Text formats must be valid UTF-8 without NUL bytes.
 */
export async function validateUpload(buf: Buffer, filename: string, maxBytes: number): Promise<ValidatedFile> {
  if (buf.length === 0) throw new AppError("FILE_REJECTED", "file_empty");
  if (buf.length > maxBytes) throw new AppError("FILE_REJECTED", "file_too_large");
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const detected = await fileTypeFromBuffer(buf);
  if (detected) {
    const entry = Object.values(ALLOWED).find((a) => a.mime === detected.mime);
    if (!entry) throw new AppError("FILE_REJECTED", "file_type_not_allowed");
    if (!entry.exts.includes(ext)) throw new AppError("FILE_REJECTED", "file_extension_mismatch");
    return { mime: entry.mime, ext, kind: entry.kind };
  }
  // No magic bytes: only plain text is acceptable.
  const textEntry = Object.values(ALLOWED).find((a) => a.kind === "text" && a.exts.includes(ext));
  if (!textEntry) throw new AppError("FILE_REJECTED", "file_type_not_allowed");
  if (buf.includes(0)) throw new AppError("FILE_REJECTED", "file_binary_content");
  try { new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { throw new AppError("FILE_REJECTED", "file_not_utf8"); }
  return { mime: textEntry.mime, ext, kind: "text" };
}
