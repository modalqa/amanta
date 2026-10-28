import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/session";
import { getTemplate } from "@/server/services/checklists";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n";
import { Field, Flash, PageHeader } from "@/components/ui";
import { ChecklistRunner } from "@/components/checklist-runner";
import { flash, type SP } from "../../../../_lib/server";
import { submitAction } from "../../actions";

export default async function RunChecklistPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx("checklists:submit");
  const t = getT(ctx.org.locale);
  const { id } = await params;
  const tpl = await getTemplate(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  if (tpl.status !== "ACTIVE") notFound();
  const batches = await ctx.db.batch.findMany({ where: { status: { in: ["IN_PRODUCTION", "ON_HOLD"] } }, select: { id: true, batchNumber: true, product: { select: { name: true } } }, orderBy: { productionDate: "desc" }, take: 50 });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={tpl.name} subtitle={t("checklists.runHelp")} />
      <Flash {...flash(t, await searchParams)} />
      <form action={submitAction} className="space-y-4">
        <input type="hidden" name="templateId" value={tpl.id} />
        <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-3">
          <Field label={t("nav.batches")}><select name="batchId" className="input"><option value="">–</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.batchNumber} · {b.product.name}</option>)}</select></Field>
          <Field label={t("checklists.shift")}><select name="shift" className="input">{["Pagi", "Siang", "Malam"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label={t("checklists.line")}><input name="line" className="input" /></Field>
        </div>
        <ChecklistRunner tempUnit={ctx.org.temperatureUnit} items={tpl.items.map((i) => ({ id: i.id, seq: i.seq, prompt: i.prompt, guidance: i.guidance, type: i.type, required: i.required, minValue: i.minValue, maxValue: i.maxValue, unit: i.unit, expectedBool: i.expectedBool, ccp: i.haccpControl?.status === "APPROVED" ? i.haccpControl.ccpCode : null }))}
          labels={{ yes: t("common.yes"), no: t("common.no"), limit: t("checklists.limit"), notePlaceholder: t("checklists.failNote"), failWarning: t("checklists.failWarning") }} />
        <Field label={t("common.notes")}><textarea name="notes" rows={2} className="input" /></Field>
        <button className="btn btn-primary h-12 w-full text-base">{t("checklists.submit")}</button>
      </form>
    </div>
  );
}
