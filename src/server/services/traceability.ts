import "server-only";
import { z } from "zod";
import { ensure, type Ctx } from "../context";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { assertOwned } from "../db/tenant";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
const opt = (max: number) => z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(max).nullable());
const posNum = z.preprocess((v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v), z.number().finite().positive());
const date = z.preprocess((v) => (v ? new Date(String(v)) : v), z.date());
const optDate = z.preprocess((v) => (v === "" || v == null ? null : new Date(String(v))), z.date().nullable());

export const ingredientSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: opt(40),
  supplierId: opt(40),
  allergens: z.preprocess((v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v ?? []), z.array(z.string().max(50)).max(20)),
  halalCritical: z.preprocess((v) => v === true || v === "on", z.boolean()),
  specification: opt(4000),
  unit: z.string().trim().min(1).max(20).default("kg"),
});

export const lotSchema = z.object({
  ingredientId: z.string().min(1).max(40),
  supplierId: opt(40),
  lotNumber: z.string().trim().min(1).max(80),
  receivedAt: date,
  quantity: posNum,
  unit: z.string().trim().min(1).max(20),
  expiryDate: optDate,
  coaDocumentId: opt(40),
  notes: opt(1000),
});

export const batchSchema = z.object({
  batchNumber: z.string().trim().min(1).max(80),
  productId: z.string().min(1).max(40),
  productionDate: date,
  expiryDate: optDate,
  quantity: posNum,
  unit: z.string().trim().min(1).max(20),
  line: opt(60),
  notes: opt(1000),
  inputs: z.array(z.object({ lotId: z.string().min(1).max(40), quantity: posNum, unit: z.string().trim().min(1).max(20) })).max(100).default([]),
});

export const shipmentSchema = z.object({
  customer: z.string().trim().min(2).max(150),
  destination: opt(200),
  quantity: posNum,
  unit: z.string().trim().min(1).max(20),
  shippedAt: date,
  reference: opt(80),
});

export async function listIngredients(ctx: Ctx) {
  ensure(ctx, "traceability:read");
  return ctx.db.ingredient.findMany({ include: { supplier: { select: { id: true, name: true } }, _count: { select: { lots: true } } }, orderBy: { name: "asc" } });
}

export async function createIngredient(ctx: Ctx, input: z.infer<typeof ingredientSchema>) {
  ensure(ctx, "traceability:write");
  const d = ingredientSchema.parse(input);
  await assertOwned(ctx.db, "Supplier", [d.supplierId]);
  if (await ctx.db.ingredient.findFirst({ where: { name: d.name } })) throw new AppError("CONFLICT", "ingredient_exists");
  const ing = await ctx.db.ingredient.create({ data: { ...d, organizationId: ctx.orgId } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "ingredient.created", entityType: "Ingredient", entityId: ing.id, summary: d.name });
  return ing;
}

export async function listLots(ctx: Ctx) {
  ensure(ctx, "traceability:read");
  return ctx.db.ingredientLot.findMany({ include: { ingredient: { select: { name: true, halalCritical: true } }, supplier: { select: { name: true } } }, orderBy: { receivedAt: "desc" }, take: 500 });
}

/** Receives a raw-material lot. Lots start in QUARANTINE until QA releases them. */
export async function receiveLot(ctx: Ctx, input: z.infer<typeof lotSchema>) {
  ensure(ctx, "traceability:write");
  const d = lotSchema.parse(input);
  await assertOwned(ctx.db, "Ingredient", [d.ingredientId]);
  await assertOwned(ctx.db, "Supplier", [d.supplierId]);
  await assertOwned(ctx.db, "Document", [d.coaDocumentId]);
  if (await ctx.db.ingredientLot.findFirst({ where: { ingredientId: d.ingredientId, lotNumber: d.lotNumber } })) throw new AppError("CONFLICT", "lot_exists");
  const lot = await ctx.db.ingredientLot.create({ data: { ...d, organizationId: ctx.orgId } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "lot.received", entityType: "IngredientLot", entityId: lot.id, summary: d.lotNumber });
  return lot;
}

/**
 * Releasing a lot requires: supplier APPROVED, and for halal-critical ingredients a
 * non-expired HALAL certificate on the supplier.
 */
export async function setLotStatus(ctx: Ctx, id: string, status: "RELEASED" | "REJECTED" | "QUARANTINE") {
  ensure(ctx, "suppliers:write");
  const lot = await ctx.db.ingredientLot.findUnique({ where: { id }, include: { ingredient: true, supplier: { include: { certificates: true } } } });
  if (!lot) throw new AppError("NOT_FOUND", "lot_not_found");
  if (status === "RELEASED") {
    if (lot.supplier && lot.supplier.status !== "APPROVED") throw new AppError("VALIDATION", "supplier_not_approved");
    if (lot.ingredient.halalCritical) {
      const ok = lot.supplier?.certificates.some((c) => c.type === "HALAL" && (!c.expiresAt || c.expiresAt > new Date()));
      if (!ok) throw new AppError("VALIDATION", "halal_certificate_required");
    }
    if (lot.expiryDate && lot.expiryDate < new Date()) throw new AppError("VALIDATION", "lot_expired");
  }
  await ctx.db.ingredientLot.update({ where: { id }, data: { status } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "lot.status_changed", entityType: "IngredientLot", entityId: id, metadata: { from: lot.status, to: status } });
}

export async function listBatches(ctx: Ctx) {
  ensure(ctx, "traceability:read");
  return ctx.db.batch.findMany({ include: { product: { select: { name: true } }, _count: { select: { inputs: true, shipments: true, deviations: true } } }, orderBy: { productionDate: "desc" }, take: 500 });
}

/** Creates a production batch and links consumed RELEASED ingredient lots. */
export async function createBatch(ctx: Ctx, input: z.infer<typeof batchSchema>) {
  ensure(ctx, "traceability:write");
  const d = batchSchema.parse(input);
  await assertOwned(ctx.db, "Product", [d.productId]);
  await assertOwned(ctx.db, "IngredientLot", d.inputs.map((i) => i.lotId));
  if (await ctx.db.batch.findFirst({ where: { batchNumber: d.batchNumber } })) throw new AppError("CONFLICT", "batch_exists");
  if (d.inputs.length) {
    const lots = await ctx.db.ingredientLot.findMany({ where: { id: { in: d.inputs.map((i) => i.lotId) } } });
    const blocked = lots.filter((l) => l.status !== "RELEASED");
    if (blocked.length) throw new AppError("VALIDATION", "lots_not_released", { lots: blocked.map((l) => l.lotNumber) });
  }
  const batch = await ctx.db.$transaction(async (t) => {
    const tx = t as unknown as Tx;
    const b = await tx.batch.create({ data: { organizationId: ctx.orgId, batchNumber: d.batchNumber, productId: d.productId, productionDate: d.productionDate, expiryDate: d.expiryDate, quantity: d.quantity, unit: d.unit, line: d.line, notes: d.notes, createdById: ctx.userId ?? `apikey:${ctx.actor.apiKeyId}` } });
    if (d.inputs.length) await tx.batchInput.createMany({ data: d.inputs.map((i) => ({ organizationId: ctx.orgId, batchId: b.id, lotId: i.lotId, quantity: i.quantity, unit: i.unit })) });
    await writeAudit(ctx.orgId, ctx.actor, { action: "batch.created", entityType: "Batch", entityId: b.id, summary: d.batchNumber, metadata: { inputs: d.inputs.length } }, tx);
    return b;
  });
  return batch;
}

export async function setBatchStatus(ctx: Ctx, id: string, status: "IN_PRODUCTION" | "ON_HOLD" | "RELEASED" | "REJECTED") {
  ensure(ctx, "deviations:close");
  const b = await ctx.db.batch.findUnique({ where: { id }, include: { deviations: { where: { status: { not: "CLOSED" } }, select: { code: true } } } });
  if (!b) throw new AppError("NOT_FOUND", "batch_not_found");
  if (status === "RELEASED" && b.deviations.length) throw new AppError("INVALID_STATE", "open_deviations_block_release", { deviations: b.deviations.map((d) => d.code) });
  await ctx.db.batch.update({ where: { id }, data: { status } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "batch.status_changed", entityType: "Batch", entityId: id, metadata: { from: b.status, to: status } });
}

export async function addShipment(ctx: Ctx, batchId: string, input: z.infer<typeof shipmentSchema>) {
  ensure(ctx, "traceability:write");
  const d = shipmentSchema.parse(input);
  const b = await ctx.db.batch.findUnique({ where: { id: batchId }, include: { shipments: true } });
  if (!b) throw new AppError("NOT_FOUND", "batch_not_found");
  if (b.status !== "RELEASED" && b.status !== "SHIPPED") throw new AppError("INVALID_STATE", "batch_not_released");
  const shipped = b.shipments.reduce((a, s) => a + s.quantity, 0);
  if (shipped + d.quantity > b.quantity + 1e-9) throw new AppError("VALIDATION", "shipment_exceeds_batch");
  const s = await ctx.db.shipment.create({ data: { ...d, batchId, organizationId: ctx.orgId } });
  await ctx.db.batch.update({ where: { id: batchId }, data: { status: "SHIPPED" } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "batch.shipped", entityType: "Batch", entityId: batchId, summary: `${d.quantity} ${d.unit} → ${d.customer}` });
  return s;
}

export async function getBatch(ctx: Ctx, id: string) {
  ensure(ctx, "traceability:read");
  const b = await ctx.db.batch.findUnique({
    where: { id },
    include: {
      product: true,
      inputs: { include: { lot: { include: { ingredient: true, supplier: { select: { id: true, name: true } } } } } },
      shipments: { orderBy: { shippedAt: "asc" } },
      ccpRecords: { include: { haccpControl: { select: { ccpCode: true, processStep: true } } }, orderBy: { recordedAt: "asc" } },
      submissions: { include: { template: { select: { name: true } } }, orderBy: { submittedAt: "asc" } },
      deviations: { select: { id: true, code: true, title: true, status: true, severity: true } },
    },
  });
  if (!b) throw new AppError("NOT_FOUND", "batch_not_found");
  return b;
}

/** Backward trace (batch → lots → suppliers) is getBatch; forward trace: lot → batches → shipments. */
export async function traceLotForward(ctx: Ctx, lotId: string) {
  ensure(ctx, "traceability:read");
  const lot = await ctx.db.ingredientLot.findUnique({ where: { id: lotId }, include: { ingredient: true, supplier: true, batchInputs: { include: { batch: { include: { product: { select: { name: true } }, shipments: true } } } } } });
  if (!lot) throw new AppError("NOT_FOUND", "lot_not_found");
  return lot;
}

export async function searchTrace(ctx: Ctx, q: string) {
  ensure(ctx, "traceability:read");
  const term = q.trim();
  if (!term) return { batches: [], lots: [] };
  const [batches, lots] = await Promise.all([
    ctx.db.batch.findMany({ where: { batchNumber: { contains: term, mode: "insensitive" } }, include: { product: { select: { name: true } } }, take: 20 }),
    ctx.db.ingredientLot.findMany({ where: { lotNumber: { contains: term, mode: "insensitive" } }, include: { ingredient: { select: { name: true } } }, take: 20 }),
  ]);
  return { batches, lots };
}
