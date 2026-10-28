"use server";
import { requireCtx } from "@/server/auth/session";
import { linkEvidence, reprocessDocument, requestDocumentAi, uploadDocument } from "@/server/services/documents";
import { AppError } from "@/server/errors";
import { fd, runAction } from "../../_lib/server";

export async function uploadAction(form: FormData) {
  await runAction("/app/documents", async () => {
    const ctx = await requireCtx("documents:write");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("FILE_REJECTED", "file_empty");
    const bytes = Buffer.from(await file.arrayBuffer());
    const doc = await uploadDocument(ctx, { title: fd(form, "title") || file.name, category: fd(form, "category"), supplierId: fd(form, "supplierId") || null }, { name: file.name, bytes });
    return `/app/documents/${doc.id}?ok=uploaded`;
  });
}

export async function aiAction(form: FormData) {
  const id = fd(form, "documentId");
  await runAction(`/app/documents/${id}`, async () => {
    const ctx = await requireCtx("ai:run");
    const kind = fd(form, "kind") === "CHECKLIST_FROM_DOCUMENT" ? "CHECKLIST_FROM_DOCUMENT" : "HACCP_FROM_DOCUMENT";
    await requestDocumentAi(ctx, id, kind);
  }, "ai_queued");
}

export async function reprocessAction(form: FormData) {
  const id = fd(form, "documentId");
  await runAction(`/app/documents/${id}`, async () => {
    const ctx = await requireCtx("documents:write");
    await reprocessDocument(ctx, id);
  }, "reprocessing");
}

/** Upload a file and link it as evidence to an entity (deviation, CAPA, batch...). */
export async function uploadEvidenceAction(form: FormData) {
  const back = fd(form, "back");
  await runAction(back, async () => {
    const ctx = await requireCtx("deviations:create");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("FILE_REJECTED", "file_empty");
    const entityType = fd(form, "entityType") as "Deviation" | "Capa" | "Batch";
    if (!["Deviation", "Capa", "Batch"].includes(entityType)) throw new AppError("VALIDATION", "invalid_entity");
    // Evidence uploads are allowed for anyone who can report deviations; uses an elevated document write.
    const evidenceCtx = { ...ctx, permissions: new Set([...ctx.permissions, "documents:write" as const]) };
    const doc = await uploadDocument(evidenceCtx, { title: fd(form, "title") || file.name, category: "EVIDENCE" }, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
    await linkEvidence(ctx, { documentId: doc.id, entityType, entityId: fd(form, "entityId"), note: fd(form, "note") });
  }, "evidence_added");
}
