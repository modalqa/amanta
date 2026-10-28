"use server";
import { requireCtx } from "@/server/auth/session";
import { activateTemplate, archiveTemplate, createTemplate, submitChecklist, updateDraftTemplate } from "@/server/services/checklists";
import { AppError } from "@/server/errors";
import { toCelsius } from "@/lib/format";
import { fd, runAction } from "../../_lib/server";

function parseJson(form: FormData, key: string): unknown {
  try { return JSON.parse(fd(form, key) || "null"); } catch { throw new AppError("VALIDATION", "invalid_input"); }
}

function templateFromForm(form: FormData) {
  return { name: fd(form, "name"), description: fd(form, "description"), category: fd(form, "category") || "OPERATIONAL", frequency: fd(form, "frequency") || "PER_SHIFT", items: parseJson(form, "items") } as never;
}

export async function createTemplateAction(form: FormData) {
  await runAction("/app/checklists/new", async () => {
    const ctx = await requireCtx("checklists:manage");
    const tpl = await createTemplate(ctx, templateFromForm(form));
    return `/app/checklists/${tpl.id}?ok=saved`;
  });
}

export async function updateTemplateAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/checklists/${id}`, async () => {
    const ctx = await requireCtx("checklists:manage");
    await updateDraftTemplate(ctx, id, templateFromForm(form));
  });
}

export async function activateAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/checklists/${id}`, async () => {
    const ctx = await requireCtx("checklists:manage");
    await activateTemplate(ctx, id);
  }, "activated");
}

export async function archiveAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/checklists/${id}`, async () => {
    const ctx = await requireCtx("checklists:manage");
    await archiveTemplate(ctx, id);
  });
}

type RawResponse = { itemId: string; valueBool?: boolean | null; valueNumber?: number | null; valueText?: string | null; note?: string | null; isTemp?: boolean };

export async function submitAction(form: FormData) {
  const templateId = fd(form, "templateId");
  await runAction(`/app/checklists/${templateId}/run`, async () => {
    const ctx = await requireCtx("checklists:submit");
    const raw = (parseJson(form, "responses") as RawResponse[] | null) ?? [];
    if (!Array.isArray(raw)) throw new AppError("VALIDATION", "invalid_input");
    // Temperatures are entered in the organization's unit and stored in °C.
    const responses = raw.map(({ isTemp, ...r }) => ({ ...r, valueNumber: r.valueNumber != null && isTemp ? toCelsius(r.valueNumber, ctx.org.temperatureUnit) : r.valueNumber ?? null }));
    const res = await submitChecklist(ctx, { templateId, batchId: fd(form, "batchId"), shift: fd(form, "shift"), line: fd(form, "line"), notes: fd(form, "notes"), responses });
    return `/app/checklists/submissions/${res.submission.id}?ok=${res.deviationId ? "submitted_with_deviation" : "submitted"}`;
  });
}
