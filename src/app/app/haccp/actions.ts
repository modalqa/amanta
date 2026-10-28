"use server";
import { requireCtx } from "@/server/auth/session";
import { bulkApprove, createControl, generateChecklistFromCcps, retireControl, reviewControl, reviseControl, updateControl, createProduct, type ControlInput } from "@/server/services/haccp";
import { fd, runAction } from "../../_lib/server";
import { toCelsius, isTemperatureUnit } from "@/lib/format";

function controlFromForm(form: FormData, tempUnit: "C" | "F"): ControlInput {
  const g = (k: string) => fd(form, k);
  const unit = g("limitUnit");
  // Temperatures are stored in °C; values typed in °F (shown to °F organizations) are converted.
  const isF = isTemperatureUnit(unit) && /f\b|fahrenheit/i.test(unit);
  void tempUnit;
  const conv = (v: string) => (v === "" ? "" : isF ? String(toCelsius(Number(v.replace(",", ".")), "F")) : v);
  return {
    productId: g("productId"), processStep: g("processStep"), hazardType: g("hazardType"), hazardDescription: g("hazardDescription"),
    severity: g("severity"), likelihood: g("likelihood"), isCcp: form.get("isCcp") === "on", ccpCode: g("ccpCode"), justification: g("justification"),
    controlMeasure: g("controlMeasure"), criticalLimitMin: conv(g("criticalLimitMin")), criticalLimitMax: conv(g("criticalLimitMax")),
    limitUnit: isTemperatureUnit(unit) ? "°C" : unit, criticalLimitText: g("criticalLimitText"), monitoringProcedure: g("monitoringProcedure"),
    monitoringFrequency: g("monitoringFrequency"), correctiveAction: g("correctiveAction"), verificationProcedure: g("verificationProcedure"), records: g("records"),
  } as unknown as ControlInput;
}

export async function createControlAction(form: FormData) {
  await runAction("/app/haccp/new", async () => {
    const ctx = await requireCtx("haccp:write");
    const c = await createControl(ctx, controlFromForm(form, ctx.org.temperatureUnit));
    return `/app/haccp/${c.id}?ok=saved`;
  });
}

export async function updateControlAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/haccp/${id}`, async () => {
    const ctx = await requireCtx("haccp:write");
    await updateControl(ctx, id, controlFromForm(form, ctx.org.temperatureUnit));
  });
}

export async function reviewAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/haccp/${id}`, async () => {
    const ctx = await requireCtx("haccp:approve");
    await reviewControl(ctx, id, fd(form, "decision") === "REJECT" ? "REJECT" : "APPROVE", fd(form, "note"));
  }, "reviewed");
}

export async function bulkApproveAction(form: FormData) {
  await runAction("/app/haccp?status=DRAFT", async () => {
    const ctx = await requireCtx("haccp:approve");
    const ids = form.getAll("ids").filter((x): x is string => typeof x === "string");
    const res = await bulkApprove(ctx, ids, fd(form, "note"));
    const failed = res.filter((r) => !r.ok).length;
    return `/app/haccp?status=DRAFT&ok=${failed ? "bulk_partial" : "reviewed"}`;
  });
}

export async function retireAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/haccp/${id}`, async () => {
    const ctx = await requireCtx("haccp:approve");
    await retireControl(ctx, id, fd(form, "reason"));
  });
}

export async function reviseAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/haccp/${id}`, async () => {
    const ctx = await requireCtx("haccp:write");
    const d = await reviseControl(ctx, id);
    return `/app/haccp/${d.id}?ok=revised`;
  });
}

export async function generateChecklistAction(form: FormData) {
  await runAction("/app/haccp", async () => {
    const ctx = await requireCtx("checklists:manage");
    const tpl = await generateChecklistFromCcps(ctx, fd(form, "name"));
    return `/app/checklists/${tpl.id}?ok=generated`;
  });
}

export async function createProductAction(form: FormData) {
  await runAction("/app/products", async () => {
    const ctx = await requireCtx("haccp:write");
    await createProduct(ctx, { name: fd(form, "name"), code: fd(form, "code"), description: fd(form, "description"), shelfLifeDays: fd(form, "shelfLifeDays"), halalCertified: form.get("halalCertified") === "on", bpomNumber: fd(form, "bpomNumber") } as never);
  });
}
