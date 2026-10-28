"use server";
import { requireCtx } from "@/server/auth/session";
import { addCertificate, createSupplier, deleteCertificate, updateSupplier } from "@/server/services/suppliers";
import { uploadDocument } from "@/server/services/documents";
import { fd, runAction } from "../../_lib/server";

function supplierFromForm(form: FormData) {
  return { name: fd(form, "name"), code: fd(form, "code"), contactName: fd(form, "contactName"), email: fd(form, "email"), phone: fd(form, "phone"), address: fd(form, "address"), status: fd(form, "status") || "PENDING", riskLevel: fd(form, "riskLevel") || "MEDIUM", notes: fd(form, "notes") } as never;
}

export async function createSupplierAction(form: FormData) {
  await runAction("/app/suppliers", async () => {
    const ctx = await requireCtx("suppliers:write");
    const s = await createSupplier(ctx, supplierFromForm(form));
    return `/app/suppliers/${s.id}?ok=saved`;
  });
}

export async function updateSupplierAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/suppliers/${id}`, async () => {
    const ctx = await requireCtx("suppliers:write");
    await updateSupplier(ctx, id, supplierFromForm(form));
  });
}

export async function addCertificateAction(form: FormData) {
  const supplierId = fd(form, "supplierId");
  await runAction(`/app/suppliers/${supplierId}`, async () => {
    const ctx = await requireCtx("suppliers:write");
    let documentId: string | null = null;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      const doc = await uploadDocument({ ...ctx, permissions: new Set([...ctx.permissions, "documents:write" as const]) }, { title: `${fd(form, "type")} ${fd(form, "number")}`, category: fd(form, "type") === "COA" ? "COA" : "SUPPLIER_CERTIFICATE", supplierId }, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
      documentId = doc.id;
    }
    await addCertificate(ctx, supplierId, { type: fd(form, "type"), number: fd(form, "number"), issuer: fd(form, "issuer"), issuedAt: fd(form, "issuedAt"), expiresAt: fd(form, "expiresAt"), documentId, notes: fd(form, "notes") } as never);
  });
}

export async function deleteCertificateAction(form: FormData) {
  const supplierId = fd(form, "supplierId");
  await runAction(`/app/suppliers/${supplierId}`, async () => {
    await deleteCertificate(await requireCtx("suppliers:write"), fd(form, "id"));
  });
}
