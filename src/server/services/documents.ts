import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensure, requireUserId, type Ctx } from "../context";
import { AppError } from "../errors";
import { env } from "../env";
import { sha256Hex } from "../crypto";
import { sanitizeFilename, validateUpload } from "../extract/filetype";
import { storage } from "../storage";
import { writeAudit } from "../audit";
import { assertOwned } from "../db/tenant";
import { enqueue, QUEUES } from "../jobs/queue";
import { rateLimit } from "../ratelimit";
import { DocumentCategory } from "@/generated/prisma/enums";

export const uploadSchema = z.object({
  title: z.string().trim().min(2).max(200),
  category: z.enum(Object.values(DocumentCategory) as [string, ...string[]]),
  supplierId: z.string().max(40).optional().nullable(),
});

export async function uploadDocument(ctx: Ctx, meta: z.infer<typeof uploadSchema>, file: { name: string; bytes: Buffer }) {
  ensure(ctx, "documents:write");
  await rateLimit(`upload:${ctx.orgId}:${ctx.userId}`, 60, 3600);
  const m = uploadSchema.parse(meta);
  await assertOwned(ctx.db, "Supplier", [m.supplierId]);
  const originalName = sanitizeFilename(file.name);
  const vf = await validateUpload(file.bytes, originalName, env().UPLOAD_MAX_MB * 1024 * 1024);
  const sha256 = sha256Hex(file.bytes);
  // Storage keys are random and namespaced by tenant; user-supplied names never reach the path.
  const storageKey = `org/${ctx.orgId}/docs/${randomUUID()}.${vf.ext}`;
  await storage().put(storageKey, file.bytes, vf.mime);
  const doc = await ctx.db.document.create({
    data: {
      organizationId: ctx.orgId, title: m.title, category: m.category as DocumentCategory, originalName, mimeType: vf.mime,
      sizeBytes: file.bytes.length, sha256, storageKey, uploadedById: requireUserId(ctx), supplierId: m.supplierId || null,
      status: vf.kind === "image" ? "EXTRACTED" : "UPLOADED",
      extractionError: vf.kind === "image" ? "image_ocr_not_supported" : null,
    },
  });
  await writeAudit(ctx.orgId, ctx.actor, { action: "document.uploaded", entityType: "Document", entityId: doc.id, summary: `${m.title} (${originalName})`, metadata: { sha256, sizeBytes: file.bytes.length, mime: vf.mime } });
  if (vf.kind !== "image") await enqueue(QUEUES.extractDocument, { orgId: ctx.orgId, documentId: doc.id });
  return doc;
}

export async function listDocuments(ctx: Ctx, filter: { category?: string; q?: string } = {}) {
  ensure(ctx, "documents:read");
  return ctx.db.document.findMany({
    where: {
      ...(filter.category ? { category: filter.category as DocumentCategory } : {}),
      ...(filter.q ? { OR: [{ title: { contains: filter.q, mode: "insensitive" } }, { originalName: { contains: filter.q, mode: "insensitive" } }] } : {}),
    },
    select: { id: true, title: true, category: true, status: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true, supplier: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getDocument(ctx: Ctx, id: string) {
  ensure(ctx, "documents:read");
  const doc = await ctx.db.document.findUnique({ where: { id }, include: { aiRuns: { orderBy: { createdAt: "desc" }, take: 10 }, supplier: { select: { id: true, name: true } } } });
  if (!doc) throw new AppError("NOT_FOUND", "document_not_found");
  return doc;
}

export async function readDocumentFile(ctx: Ctx, id: string) {
  ensure(ctx, "documents:read");
  const doc = await ctx.db.document.findUnique({ where: { id }, select: { id: true, storageKey: true, mimeType: true, originalName: true, sha256: true } });
  if (!doc) throw new AppError("NOT_FOUND", "document_not_found");
  const bytes = await storage().get(doc.storageKey);
  if (sha256Hex(bytes) !== doc.sha256) throw new AppError("STORAGE_FAILED", "integrity_check_failed");
  await writeAudit(ctx.orgId, ctx.actor, { action: "document.downloaded", entityType: "Document", entityId: doc.id });
  return { bytes, mimeType: doc.mimeType, filename: doc.originalName };
}

export async function reprocessDocument(ctx: Ctx, id: string) {
  ensure(ctx, "documents:write");
  const doc = await ctx.db.document.findUnique({ where: { id } });
  if (!doc) throw new AppError("NOT_FOUND", "document_not_found");
  await ctx.db.document.update({ where: { id }, data: { status: "UPLOADED", extractionError: null } });
  await enqueue(QUEUES.extractDocument, { orgId: ctx.orgId, documentId: id });
}

/** Requests an AI run (HACCP draft or checklist draft) for an extracted document. */
export async function requestDocumentAi(ctx: Ctx, documentId: string, kind: "HACCP_FROM_DOCUMENT" | "CHECKLIST_FROM_DOCUMENT") {
  ensure(ctx, "ai:run");
  await rateLimit(`ai:${ctx.orgId}`, 30, 3600);
  const doc = await ctx.db.document.findUnique({ where: { id: documentId }, select: { id: true, status: true, extractedText: true } });
  if (!doc) throw new AppError("NOT_FOUND", "document_not_found");
  if (doc.status !== "EXTRACTED" || !doc.extractedText?.trim()) throw new AppError("INVALID_STATE", "document_not_extracted");
  const active = await ctx.db.aiRun.count({ where: { documentId, kind, status: { in: ["QUEUED", "RUNNING"] } } });
  if (active > 0) throw new AppError("CONFLICT", "ai_run_in_progress");
  const run = await ctx.db.aiRun.create({ data: { organizationId: ctx.orgId, kind, documentId, requestedById: requireUserId(ctx) } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "ai.requested", entityType: "AiRun", entityId: run.id, metadata: { kind, documentId } });
  await enqueue(kind === "HACCP_FROM_DOCUMENT" ? QUEUES.aiHaccp : QUEUES.aiChecklist, { orgId: ctx.orgId, aiRunId: run.id });
  return run;
}

export async function linkEvidence(ctx: Ctx, input: { documentId: string; entityType: "Deviation" | "Capa" | "Batch" | "CcpRecord" | "ChecklistSubmission"; entityId: string; note?: string }) {
  ensure(ctx, "documents:read");
  await assertOwned(ctx.db, "Document", [input.documentId]);
  await assertOwned(ctx.db, input.entityType, [input.entityId]);
  const link = await ctx.db.evidenceLink.create({ data: { organizationId: ctx.orgId, documentId: input.documentId, entityType: input.entityType, entityId: input.entityId, note: input.note?.slice(0, 500), createdById: requireUserId(ctx) } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "evidence.linked", entityType: input.entityType, entityId: input.entityId, metadata: { documentId: input.documentId } });
  return link;
}

export async function listEvidence(ctx: Ctx, entityType: string, entityId: string) {
  return ctx.db.evidenceLink.findMany({ where: { entityType, entityId }, include: { document: { select: { id: true, title: true, originalName: true, mimeType: true } } }, orderBy: { createdAt: "desc" } });
}
