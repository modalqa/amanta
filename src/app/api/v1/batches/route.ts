import { apiRoute, readJson } from "@/server/http";
import { createBatch, listBatches } from "@/server/services/traceability";

export const GET = apiRoute("traceability:read", async (ctx) => (await listBatches(ctx)).map((b) => ({ id: b.id, batchNumber: b.batchNumber, product: b.product.name, productionDate: b.productionDate, quantity: b.quantity, unit: b.unit, status: b.status })));
export const POST = apiRoute("traceability:write", async (ctx, req) => {
  const b = await createBatch(ctx, (await readJson(req)) as never);
  return { id: b.id, batchNumber: b.batchNumber, status: b.status };
});
