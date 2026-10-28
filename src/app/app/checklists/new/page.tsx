import { requireCtx } from "@/server/auth/session";
import { listApprovedCcps } from "@/server/services/haccp";
import { getT } from "@/i18n";
import { Card, Field, Flash, PageHeader } from "@/components/ui";
import { ChecklistBuilder } from "@/components/checklist-builder";
import { flash, type SP } from "../../../_lib/server";
import { createTemplateAction } from "../actions";
import { builderLabels } from "../labels";
import { FREQUENCIES } from "../constants";

export const metadata = { title: "Checklist baru" };

export default async function NewChecklistPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("checklists:manage");
  const t = getT(ctx.org.locale);
  const ccps = await listApprovedCcps(ctx);
  return (
    <>
      <PageHeader title={t("checklists.new")} subtitle={t("checklists.newHelp")} />
      <Flash {...flash(t, await searchParams)} />
      <Card>
        <form action={createTemplateAction} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={t("common.name")}><input name="name" required className="input" /></Field>
            <Field label={t("checklists.frequency")}><select name="frequency" className="input">{FREQUENCIES.map((f) => <option key={f} value={f}>{t(`frequency.${f}`)}</option>)}</select></Field>
            <Field label={t("common.category")}><select name="category" className="input">{["OPERATIONAL", "CCP_MONITORING", "GMP_CPPOB", "SANITATION", "HALAL", "RECEIVING"].map((c) => <option key={c} value={c}>{t(`tplCategory.${c}`)}</option>)}</select></Field>
          </div>
          <Field label={t("common.description")}><input name="description" className="input" /></Field>
          <ChecklistBuilder initial={[]} ccps={ccps.map((c) => ({ id: c.id, label: `${c.ccpCode} – ${c.processStep}` }))} labels={builderLabels(t)} />
          <button className="btn btn-primary">{t("common.save")}</button>
        </form>
      </Card>
    </>
  );
}
