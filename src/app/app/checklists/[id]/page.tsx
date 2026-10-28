import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { getTemplate } from "@/server/services/checklists";
import { listApprovedCcps } from "@/server/services/haccp";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n";
import { Badge, Card, Field, Flash, PageHeader, Table } from "@/components/ui";
import { ChecklistBuilder } from "@/components/checklist-builder";
import { displayValue } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../../_lib/server";
import { activateAction, archiveAction, updateTemplateAction } from "../actions";
import { builderLabels } from "../labels";
import { FREQUENCIES } from "../constants";

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx("checklists:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const { id } = await params;
  const tpl = await getTemplate(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const manage = can(ctx, "checklists:manage");
  const ccps = manage && tpl.status === "DRAFT" ? await listApprovedCcps(ctx) : [];
  const unapproved = tpl.items.filter((i) => i.haccpControl && i.haccpControl.status !== "APPROVED");
  return (
    <>
      <PageHeader title={tpl.name} subtitle={tpl.description ?? undefined} actions={<>
        {tpl.status === "ACTIVE" && can(ctx, "checklists:submit") && <Link href={`/app/checklists/${tpl.id}/run`} className="btn btn-primary">{t("checklists.run")}</Link>}
        <Link href="/app/checklists" className="btn btn-secondary">{t("common.back")}</Link>
      </>} />
      <Flash {...flash(t, await searchParams)} />
      <div className="mb-4 flex flex-wrap gap-2"><Badge status={tpl.status}>{t(`tplStatus.${tpl.status}`)}</Badge>{tpl.source === "AI" && <Badge tone="purple">{t("haccp.aiDraft")}</Badge>}<Badge>{t(`frequency.${tpl.frequency}`)}</Badge></div>
      {tpl.status === "DRAFT" && manage && (
        <Card title={t("checklists.approval")} className="mb-4">
          <p className="mb-2 text-sm text-gray-600">{t("checklists.approvalHelp")}</p>
          {unapproved.length > 0 && <p className="mb-2 text-sm text-red-700">{t("checklists.linkedNotApproved", { items: unapproved.map((i) => `#${i.seq}`).join(", ") })} <Link className="link" href="/app/haccp?status=DRAFT">{t("haccp.title")}</Link></p>}
          <form action={activateAction}><input type="hidden" name="id" value={tpl.id} /><button className="btn btn-primary" disabled={unapproved.length > 0}>{t("checklists.activate")}</button></form>
        </Card>
      )}
      <Card title={t("checklists.items")} className="mb-4">
        <Table head={["#", t("checklists.prompt"), t("checklists.type"), t("checklists.limits"), t("checklists.linkedCcp")]}>
          {tpl.items.map((i) => (
            <tr key={i.id}>
              <td>{i.seq}</td>
              <td>{i.prompt}{i.required && <span className="text-red-600"> *</span>}{i.guidance && <div className="text-xs text-gray-500">{i.guidance}</div>}</td>
              <td>{t(`itemType.${i.type}`)}</td>
              <td className="text-xs">{i.minValue != null || i.maxValue != null ? `${displayValue(i.minValue, i.unit, p)} … ${displayValue(i.maxValue, i.unit, p)}` : "–"}</td>
              <td>{i.haccpControl ? <Link className="link" href={`/app/haccp/${i.haccpControl.id}`}>{i.haccpControl.ccpCode}</Link> : "–"} {i.haccpControl && <Badge status={i.haccpControl.status}>{t(`controlStatus.${i.haccpControl.status}`)}</Badge>}</td>
            </tr>
          ))}
        </Table>
      </Card>
      {tpl.status === "DRAFT" && manage && (
        <Card title={t("checklists.editDraft")}>
          <form action={updateTemplateAction} className="space-y-4">
            <input type="hidden" name="id" value={tpl.id} />
            <div className="grid gap-3 md:grid-cols-3">
              <Field label={t("common.name")}><input name="name" defaultValue={tpl.name} required className="input" /></Field>
              <Field label={t("checklists.frequency")}><select name="frequency" defaultValue={tpl.frequency} className="input">{FREQUENCIES.map((f) => <option key={f} value={f}>{t(`frequency.${f}`)}</option>)}</select></Field>
              <Field label={t("common.description")}><input name="description" defaultValue={tpl.description ?? ""} className="input" /></Field>
            </div>
            <input type="hidden" name="category" value={tpl.category} />
            <ChecklistBuilder initial={tpl.items.map((i) => ({ prompt: i.prompt, guidance: i.guidance, type: i.type, required: i.required, minValue: i.minValue, maxValue: i.maxValue, unit: i.unit, haccpControlId: i.haccpControlId }))} ccps={[...ccps.map((c) => ({ id: c.id, label: `${c.ccpCode} – ${c.processStep}` })), ...tpl.items.filter((i) => i.haccpControl && !ccps.some((c) => c.id === i.haccpControl!.id)).map((i) => ({ id: i.haccpControl!.id, label: `${i.haccpControl!.ccpCode ?? "?"} – ${i.haccpControl!.processStep} (${i.haccpControl!.status})` }))]} labels={builderLabels(t)} />
            <button className="btn btn-primary">{t("common.saveChanges")}</button>
          </form>
        </Card>
      )}
      {tpl.status === "ACTIVE" && manage && (
        <form action={archiveAction} className="mt-4"><input type="hidden" name="id" value={tpl.id} /><button className="btn btn-secondary">{t("checklists.archive")}</button></form>
      )}
    </>
  );
}
