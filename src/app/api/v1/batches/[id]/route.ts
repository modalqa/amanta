import { apiRoute } from "@/server/http";
import { getBatch } from "@/server/services/traceability";

export const GET = apiRoute<{ id: string }>("traceability:read", async (ctx, _req, { id }) => {
  const b = await getBatch(ctx, id);
  return {
    id: b.id, batchNumber: b.batchNumber, status: b.status, product: { id: b.product.id, name: b.product.name }, productionDate: b.productionDate, expiryDate: b.expiryDate, quantity: b.quantity, unit: b.unit,
    inputs: b.inputs.map((i) => ({ lotNumber: i.lot.lotNumber, ingredient: i.lot.ingredient.name, supplier: i.lot.supplier?.name ?? null, quantity: i.quantity, unit: i.unit })),
    shipments: b.shipments.map((s) => ({ customer: s.customer, destination: s.destination, shippedAt: s.shippedAt, quantity: s.quantity, unit: s.unit })),
    ccpRecords: b.ccpRecords.map((r) => ({ ccp: r.haccpControl.ccpCode, value: r.value, unit: r.unit, withinLimits: r.withinLimits, recordedAt: r.recordedAt })),
    deviations: b.deviations.map((d) => ({ code: d.code, status: d.status, severity: d.severity })),
  };
});
