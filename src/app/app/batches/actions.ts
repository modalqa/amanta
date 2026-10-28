"use server";
import { requireCtx } from "@/server/auth/session";
import { addShipment, createBatch, createIngredient, receiveLot, setBatchStatus, setLotStatus } from "@/server/services/traceability";
import { AppError } from "@/server/errors";
import { fd, runAction } from "../../_lib/server";

export async function createIngredientAction(form: FormData) {
  await runAction("/app/ingredients", async () => {
    const ctx = await requireCtx("traceability:write");
    await createIngredient(ctx, { name: fd(form, "name"), code: fd(form, "code"), supplierId: fd(form, "supplierId"), allergens: fd(form, "allergens"), halalCritical: form.get("halalCritical") === "on", specification: fd(form, "specification"), unit: fd(form, "unit") || "kg" } as never);
  });
}

export async function receiveLotAction(form: FormData) {
  await runAction("/app/lots", async () => {
    const ctx = await requireCtx("traceability:write");
    await receiveLot(ctx, { ingredientId: fd(form, "ingredientId"), supplierId: fd(form, "supplierId"), lotNumber: fd(form, "lotNumber"), receivedAt: fd(form, "receivedAt"), quantity: fd(form, "quantity"), unit: fd(form, "unit"), expiryDate: fd(form, "expiryDate"), coaDocumentId: null, notes: fd(form, "notes") } as never);
  });
}

export async function lotStatusAction(form: FormData) {
  await runAction("/app/lots", async () => {
    const ctx = await requireCtx("suppliers:write");
    const status = fd(form, "status");
    if (!["RELEASED", "REJECTED", "QUARANTINE"].includes(status)) throw new AppError("VALIDATION", "invalid_status");
    await setLotStatus(ctx, fd(form, "id"), status as "RELEASED");
  });
}

export async function createBatchAction(form: FormData) {
  await runAction("/app/batches", async () => {
    const ctx = await requireCtx("traceability:write");
    const lotIds = form.getAll("lotId").map(String);
    const qtys = form.getAll("lotQty").map(String);
    const units = form.getAll("lotUnit").map(String);
    const inputs = lotIds.map((lotId, i) => ({ lotId, quantity: qtys[i], unit: units[i] || "kg" })).filter((x) => x.lotId && x.quantity);
    const b = await createBatch(ctx, { batchNumber: fd(form, "batchNumber"), productId: fd(form, "productId"), productionDate: fd(form, "productionDate"), expiryDate: fd(form, "expiryDate"), quantity: fd(form, "quantity"), unit: fd(form, "unit") || "kg", line: fd(form, "line"), notes: fd(form, "notes"), inputs } as never);
    return `/app/batches/${b.id}?ok=saved`;
  });
}

export async function batchStatusAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/batches/${id}`, async () => {
    const status = fd(form, "status");
    if (!["IN_PRODUCTION", "ON_HOLD", "RELEASED", "REJECTED"].includes(status)) throw new AppError("VALIDATION", "invalid_status");
    await setBatchStatus(await requireCtx("deviations:close"), id, status as "RELEASED");
  });
}

export async function shipmentAction(form: FormData) {
  const id = fd(form, "batchId");
  await runAction(`/app/batches/${id}`, async () => {
    await addShipment(await requireCtx("traceability:write"), id, { customer: fd(form, "customer"), destination: fd(form, "destination"), quantity: fd(form, "quantity"), unit: fd(form, "unit"), shippedAt: fd(form, "shippedAt"), reference: fd(form, "reference") } as never);
  });
}
