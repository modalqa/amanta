"use server";
import { requireCtx } from "@/server/auth/session";
import { closeDeviation, reportDeviation, requestCapaDraft, updateInvestigation } from "@/server/services/deviations";
import { acceptCapaDraft, createCapa } from "@/server/services/capa";
import { fd, runAction } from "../../_lib/server";

export async function reportAction(form: FormData) {
  await runAction("/app/deviations", async () => {
    const ctx = await requireCtx("deviations:create");
    const d = await reportDeviation(ctx, { title: fd(form, "title"), description: fd(form, "description"), severity: fd(form, "severity") as never, source: (fd(form, "source") || "MANUAL") as never, immediateAction: fd(form, "immediateAction"), batchId: fd(form, "batchId"), supplierId: fd(form, "supplierId"), haccpControlId: fd(form, "haccpControlId"), occurredAt: fd(form, "occurredAt") || undefined } as never);
    return `/app/deviations/${d.id}?ok=reported`;
  });
}

export async function investigationAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/deviations/${id}`, async () => {
    const ctx = await requireCtx("deviations:manage");
    await updateInvestigation(ctx, id, { rootCause: fd(form, "rootCause"), immediateAction: fd(form, "immediateAction"), disposition: fd(form, "disposition") as never });
  });
}

export async function capaDraftAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/deviations/${id}`, async () => {
    const ctx = await requireCtx("ai:run");
    await requestCapaDraft(ctx, id);
  }, "ai_queued");
}

export async function acceptDraftAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/deviations/${id}`, async () => {
    const ctx = await requireCtx("capa:manage");
    const selected = form.getAll("pick").map((x) => Number(x)).filter((n) => Number.isInteger(n));
    await acceptCapaDraft(ctx, fd(form, "aiRunId"), fd(form, "assigneeId"), selected);
  }, "capa_created");
}

export async function createCapaAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/deviations/${id}`, async () => {
    const ctx = await requireCtx("capa:manage");
    await createCapa(ctx, id, { type: fd(form, "type") as never, title: fd(form, "title"), actionPlan: fd(form, "actionPlan"), rootCause: fd(form, "rootCause"), assigneeId: fd(form, "assigneeId"), dueDate: fd(form, "dueDate") as never });
  }, "capa_created");
}

export async function closeAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/deviations/${id}`, async () => {
    const ctx = await requireCtx("deviations:close");
    await closeDeviation(ctx, id, fd(form, "closureNote"));
  }, "closed");
}
