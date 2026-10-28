import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { getDashboard } from "@/server/services/dashboard";
import { getT } from "@/i18n";
import { Badge, BarChart, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { flash, prefsOf, type SP } from "../_lib/server";
import { Flash } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const d = await getDashboard(ctx);
  return (
    <>
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle", { date: formatDateTime(new Date(), p) })} />
      <Flash {...flash(t, await searchParams)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("dashboard.openDeviations")} value={d.openDeviations} hint={t("dashboard.highCritical", { n: d.criticalDeviations })} tone={d.criticalDeviations ? "red" : "gray"} href="/app/deviations?open=1" />
        <Stat label={t("dashboard.overdueCapa")} value={d.overdueCapas} hint={t("dashboard.openCapa", { n: d.openCapas, v: d.pendingVerification })} tone={d.overdueCapas ? "red" : "green"} href="/app/capa?overdue=1" />
        <Stat label={t("dashboard.ccpCompliance")} value={d.ccpCompliance7d === null ? "–" : `${d.ccpCompliance7d}%`} hint={t("dashboard.ccpRecords", { n: d.ccpRecords7d })} tone={d.ccpCompliance7d === null ? "gray" : d.ccpCompliance7d >= 98 ? "green" : d.ccpCompliance7d >= 90 ? "amber" : "red"} href="/app/ccp" />
        <Stat label={t("dashboard.checklistsToday")} value={d.checklistsToday} hint={t("dashboard.failRate", { n: d.checklistFailRate7d ?? "–" })} href="/app/checklists" />
        <Stat label={t("dashboard.draftControls")} value={d.draftControls} hint={t("dashboard.awaitingReview")} tone={d.draftControls ? "amber" : "gray"} href="/app/haccp?status=DRAFT" />
        <Stat label={t("dashboard.approvedCcps")} value={d.approvedCcps} href="/app/haccp?status=APPROVED" />
        <Stat label={t("dashboard.activeChecklists")} value={d.activeTemplates} href="/app/checklists" />
        <Stat label={t("dashboard.batchesOnHold")} value={d.batchesOnHold} tone={d.batchesOnHold ? "red" : "gray"} href="/app/batches" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={t("dashboard.deviationTrend")} className="lg:col-span-2">
          <BarChart label={t("dashboard.deviationTrend")} data={d.deviationsPerDay.map((x) => ({ label: x.day, value: x.count }))} />
        </Card>
        <Card title={t("dashboard.certificates")} actions={<Link href="/app/suppliers" className="link text-xs">{t("common.viewAll")}</Link>}>
          {d.certificates.length === 0 ? <Empty>{t("dashboard.noCertAlerts")}</Empty> : (
            <ul className="space-y-2 text-sm">
              {d.certificates.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2">
                  <Link className="link" href={`/app/suppliers/${c.supplier.id}`}>{c.supplier.name} – {t(`certType.${c.type}`)}</Link>
                  <span className="text-right"><Badge status={c.state}>{t(`certState.${c.state}`)}</Badge><br /><span className="text-xs text-gray-500">{formatDate(c.expiresAt, p)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title={t("dashboard.recentDeviations")} className="mt-4" actions={<Link href="/app/deviations" className="link text-xs">{t("common.viewAll")}</Link>}>
        {d.recentDeviations.length === 0 ? <Empty>{t("dashboard.noOpenDeviations")}</Empty> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {d.recentDeviations.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/app/deviations/${x.id}`} className="link">{x.code} · {x.title}</Link>
                <span className="flex gap-2"><Badge status={x.severity}>{t(`severity.${x.severity}`)}</Badge><Badge status={x.status}>{t(`devStatus.${x.status}`)}</Badge><span className="text-xs text-gray-500">{formatDateTime(x.createdAt, p)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
