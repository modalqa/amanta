import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { getControl, listProducts } from "@/server/services/haccp";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n";
import { Badge, Card, Flash, PageHeader } from "@/components/ui";
import { displayValue, formatDateTime } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../../_lib/server";
import { retireAction, reviewAction, reviseAction, updateControlAction } from "../actions";
import { ControlForm } from "../control-form";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2 border-b border-gray-100 py-1.5 text-sm"><dt className="text-gray-500">{k}</dt><dd className="col-span-2">{v || "–"}</dd></div>;
}

export default async function ControlPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx("haccp:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const { id } = await params;
  const c = await getControl(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const editable = can(ctx, "haccp:write") && (c.status === "DRAFT" || c.status === "REJECTED");
  const products = editable ? await listProducts(ctx) : [];
  const reviewer = c.reviewedById ? await ctx.db.membership.findFirst({ where: { userId: c.reviewedById }, include: { user: { select: { name: true } } } }) : null;
  return (
    <>
      <PageHeader title={`${c.ccpCode ?? (c.isCcp ? "CCP" : "PRP")} · ${c.processStep}`} subtitle={c.hazardDescription} actions={<Link href="/app/haccp" className="btn btn-secondary">{t("common.back")}</Link>} />
      <Flash {...flash(t, await searchParams)} />
      <div className="mb-4 flex flex-wrap gap-2"><Badge status={c.status}>{t(`controlStatus.${c.status}`)}</Badge>{c.source === "AI" && <Badge tone="purple">{t("haccp.aiDraft")}{c.aiRun?.model ? ` · ${c.aiRun.model}` : ""}</Badge>}<Badge tone="gray">v{c.version}</Badge></div>
      {c.source === "AI" && c.status === "DRAFT" && <div className="mb-4 rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">{t("haccp.aiWarning")}</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("haccp.details")} className="lg:col-span-2">
          <dl>
            <Row k={t("haccp.product")} v={c.product?.name} />
            <Row k={t("haccp.hazardType")} v={t(`hazard.${c.hazardType}`)} />
            <Row k={t("haccp.risk")} v={`${c.severity} × ${c.likelihood} = ${c.riskScore}`} />
            <Row k={t("haccp.justification")} v={c.justification} />
            <Row k={t("haccp.controlMeasure")} v={c.controlMeasure} />
            <Row k={t("haccp.criticalLimit")} v={[c.criticalLimitMin != null ? `min ${displayValue(c.criticalLimitMin, c.limitUnit, p)}` : "", c.criticalLimitMax != null ? `maks ${displayValue(c.criticalLimitMax, c.limitUnit, p)}` : "", c.criticalLimitText ?? ""].filter(Boolean).join(" · ")} />
            <Row k={t("haccp.monitoringProcedure")} v={`${c.monitoringProcedure} (${c.monitoringFrequency})`} />
            <Row k={t("haccp.correctiveAction")} v={c.correctiveAction} />
            <Row k={t("haccp.verification")} v={c.verificationProcedure} />
            <Row k={t("haccp.records")} v={c.records} />
            <Row k={t("haccp.sourceDocument")} v={c.document ? <Link className="link" href={`/app/documents/${c.document.id}`}>{c.document.title}</Link> : null} />
            {c.reviewedAt && <Row k={t("haccp.reviewedBy")} v={`${reviewer?.user.name ?? "?"} · ${formatDateTime(c.reviewedAt, p)}${c.reviewNote ? ` — ${c.reviewNote}` : ""}`} />}
          </dl>
        </Card>
        <div className="space-y-4">
          {can(ctx, "haccp:approve") && c.status === "DRAFT" && (
            <Card title={t("haccp.review")}>
              <form action={reviewAction} className="space-y-2">
                <input type="hidden" name="id" value={c.id} />
                <textarea name="note" rows={3} className="input" placeholder={t("haccp.reviewNotePlaceholder")} />
                <div className="flex gap-2">
                  <button name="decision" value="APPROVE" className="btn btn-primary">{t("haccp.approve")}</button>
                  <button name="decision" value="REJECT" className="btn btn-danger">{t("haccp.reject")}</button>
                </div>
                <p className="text-xs text-gray-500">{t("haccp.reviewHelp")}</p>
              </form>
            </Card>
          )}
          {c.status === "APPROVED" && can(ctx, "haccp:approve") && (
            <Card title={t("haccp.changeApproved")}>
              <form action={reviseAction} className="mb-3"><input type="hidden" name="id" value={c.id} /><button className="btn btn-secondary w-full">{t("haccp.revise")}</button></form>
              <form action={retireAction} className="space-y-2"><input type="hidden" name="id" value={c.id} /><input name="reason" required className="input" placeholder={t("haccp.retireReason")} /><button className="btn btn-danger w-full">{t("haccp.retire")}</button></form>
            </Card>
          )}
        </div>
      </div>
      {editable && (
        <Card title={t("haccp.edit")} className="mt-4">
          <ControlForm t={t} action={updateControlAction} products={products} defaults={c} submitLabel={t("common.saveChanges")} tempUnit={ctx.org.temperatureUnit} />
        </Card>
      )}
    </>
  );
}
