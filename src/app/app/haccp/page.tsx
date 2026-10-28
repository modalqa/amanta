import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { listControls } from "@/server/services/haccp";
import { getT } from "@/i18n";
import { Badge, Card, Empty, Flash, PageHeader, Table } from "@/components/ui";
import { displayValue } from "@/lib/format";
import { flash, prefsOf, str, type SP } from "../../_lib/server";
import { bulkApproveAction, generateChecklistAction } from "./actions";
import type { ControlStatus } from "@/generated/prisma/enums";

export const metadata = { title: "HACCP" };
const STATUSES = ["DRAFT", "APPROVED", "REJECTED", "RETIRED"] as const;

export default async function HaccpPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("haccp:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const sp = await searchParams;
  const status = STATUSES.includes(str(sp.status) as ControlStatus) ? (str(sp.status) as ControlStatus) : undefined;
  const controls = await listControls(ctx, { status, documentId: str(sp.documentId) });
  const canApprove = can(ctx, "haccp:approve");
  const drafts = controls.filter((c) => c.status === "DRAFT");
  return (
    <>
      <PageHeader title={t("haccp.title")} subtitle={t("haccp.subtitle")} actions={<>
        {can(ctx, "haccp:write") && <Link href="/app/haccp/new" className="btn btn-primary">{t("haccp.newControl")}</Link>}
        <a href="/app/reports/download?kind=haccp-plan&format=pdf" className="btn btn-secondary">{t("haccp.exportPlan")}</a>
      </>} />
      <Flash {...flash(t, sp)} />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link href="/app/haccp" className={`btn ${!status ? "btn-primary" : "btn-secondary"}`}>{t("common.all")}</Link>
        {STATUSES.map((s) => <Link key={s} href={`/app/haccp?status=${s}`} className={`btn ${status === s ? "btn-primary" : "btn-secondary"}`}>{t(`controlStatus.${s}`)}</Link>)}
      </div>
      {drafts.length > 0 && canApprove && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("haccp.reviewNotice", { n: drafts.length })}</div>
      )}
      <form action={bulkApproveAction}>
        <Table head={[canApprove ? "" : "#", t("haccp.code"), t("haccp.processStep"), t("haccp.hazard"), t("haccp.risk"), t("haccp.criticalLimit"), t("common.status"), t("haccp.source")]} empty={controls.length === 0 ? <div className="p-4"><Empty>{t("haccp.empty")}</Empty></div> : null}>
          {controls.map((c, i) => (
            <tr key={c.id}>
              <td>{canApprove && c.status === "DRAFT" ? <input type="checkbox" name="ids" value={c.id} aria-label={c.processStep} className="h-4 w-4" /> : i + 1}</td>
              <td className="whitespace-nowrap">{c.isCcp ? <Badge tone="red">{c.ccpCode ?? "CCP"}</Badge> : <Badge tone="gray">PRP</Badge>}</td>
              <td><Link className="link" href={`/app/haccp/${c.id}`}>{c.processStep}</Link>{c.product && <div className="text-xs text-gray-500">{c.product.name}</div>}</td>
              <td className="max-w-xs"><span className="text-xs font-semibold text-gray-500">{t(`hazard.${c.hazardType}`)}</span><div>{c.hazardDescription}</div></td>
              <td><Badge tone={c.riskScore >= 15 ? "red" : c.riskScore >= 8 ? "amber" : "gray"}>{c.severity}×{c.likelihood}={c.riskScore}</Badge></td>
              <td className="text-xs">{[c.criticalLimitMin != null ? `≥ ${displayValue(c.criticalLimitMin, c.limitUnit, p)}` : "", c.criticalLimitMax != null ? `≤ ${displayValue(c.criticalLimitMax, c.limitUnit, p)}` : "", c.criticalLimitText ?? ""].filter(Boolean).join(" · ") || "–"}</td>
              <td><Badge status={c.status}>{t(`controlStatus.${c.status}`)}</Badge></td>
              <td className="text-xs">{c.source === "AI" ? <Badge tone="purple">AI</Badge> : t("haccp.manual")}{c.document && <div><Link className="link" href={`/app/documents/${c.document.id}`}>{c.document.title}</Link></div>}</td>
            </tr>
          ))}
        </Table>
        {canApprove && drafts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <input name="note" className="input max-w-md" placeholder={t("haccp.reviewNotePlaceholder")} />
            <button className="btn btn-primary">{t("haccp.approveSelected")}</button>
          </div>
        )}
      </form>
      {can(ctx, "checklists:manage") && (
        <Card title={t("haccp.generateChecklistTitle")} className="mt-4">
          <p className="mb-2 text-sm text-gray-600">{t("haccp.generateChecklistHelp")}</p>
          <form action={generateChecklistAction} className="flex flex-wrap gap-2">
            <input name="name" className="input max-w-sm" defaultValue={t("haccp.defaultChecklistName")} />
            <button className="btn btn-secondary">{t("haccp.generateChecklist")}</button>
          </form>
        </Card>
      )}
    </>
  );
}
