import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { listCcpRecords } from "@/server/services/ccp";
import { listApprovedCcps } from "@/server/services/haccp";
import { getT } from "@/i18n";
import { Badge, Card, Empty, Field, Flash, PageHeader, Table } from "@/components/ui";
import { displayValue, formatDateTime, isTemperatureUnit } from "@/lib/format";
import { flash, prefsOf, str, type SP } from "../../_lib/server";
import { recordCcpAction } from "./actions";
import { daysAgo } from "@/lib/dates";

export const metadata = { title: "Pemantauan CCP" };

export default async function CcpPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("ccp:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const sp = await searchParams;
  const controlId = str(sp.control);
  const [ccps, records, batches] = await Promise.all([
    listApprovedCcps(ctx),
    listCcpRecords(ctx, { controlId, outOnly: str(sp.out) === "1", since: daysAgo(30) }),
    ctx.db.batch.findMany({ where: { status: { in: ["IN_PRODUCTION", "ON_HOLD"] } }, select: { id: true, batchNumber: true }, orderBy: { productionDate: "desc" }, take: 50 }),
  ]);
  const measurable = ccps.filter((c) => c.criticalLimitMin !== null || c.criticalLimitMax !== null);
  return (
    <>
      <PageHeader title={t("ccp.title")} subtitle={t("ccp.subtitle")} actions={<a className="btn btn-secondary" href="/app/reports/download?kind=ccp-log&format=csv">{t("ccp.exportCsv")}</a>} />
      <Flash {...flash(t, sp)} />
      {can(ctx, "ccp:record") && (
        <Card title={t("ccp.record")} className="mb-4">
          {measurable.length === 0 ? <Empty>{t("ccp.noMeasurable")}</Empty> : (
            <form action={recordCcpAction} className="grid gap-3 md:grid-cols-5">
              <div className="md:col-span-2"><Field label="CCP"><select name="haccpControlId" required className="input">{measurable.map((c) => <option key={c.id} value={c.id}>{c.ccpCode} – {c.processStep} ({displayValue(c.criticalLimitMin, c.limitUnit, p)} … {displayValue(c.criticalLimitMax, c.limitUnit, p)})</option>)}</select></Field></div>
              <Field label={t("ccp.value")} hint={measurable.some((c) => isTemperatureUnit(c.limitUnit)) ? t("ccp.tempHint", { unit: ctx.org.temperatureUnit }) : undefined}><input name="value" inputMode="decimal" required className="input" /></Field>
              <Field label={t("nav.batches")}><select name="batchId" className="input"><option value="">–</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.batchNumber}</option>)}</select></Field>
              <Field label={t("common.notes")}><input name="note" className="input" /></Field>
              <div className="md:col-span-5"><button className="btn btn-primary">{t("ccp.save")}</button></div>
            </form>
          )}
        </Card>
      )}
      <form className="mb-3 flex flex-wrap gap-2">
        <select name="control" defaultValue={controlId ?? ""} className="input max-w-xs"><option value="">{t("ccp.allCcps")}</option>{ccps.map((c) => <option key={c.id} value={c.id}>{c.ccpCode} – {c.processStep}</option>)}</select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="out" value="1" defaultChecked={str(sp.out) === "1"} /> {t("ccp.outOnly")}</label>
        <button className="btn btn-secondary">{t("common.filter")}</button>
      </form>
      <Table head={[t("common.time"), "CCP", t("ccp.value"), t("haccp.criticalLimit"), t("common.status"), t("nav.batches"), t("ccp.source"), t("nav.deviations")]} empty={records.length === 0 ? <div className="p-4"><Empty>{t("ccp.empty")}</Empty></div> : null}>
        {records.map((r) => (
          <tr key={r.id} className={r.withinLimits ? "" : "bg-red-50"}>
            <td className="text-xs">{formatDateTime(r.recordedAt, p)}</td>
            <td>{r.haccpControl.ccpCode}<div className="text-xs text-gray-500">{r.haccpControl.processStep}</div></td>
            <td className="font-medium">{displayValue(r.value, r.unit, p)}</td>
            <td className="text-xs">{displayValue(r.haccpControl.criticalLimitMin, r.unit, p)} … {displayValue(r.haccpControl.criticalLimitMax, r.unit, p)}</td>
            <td><Badge status={r.withinLimits ? "OK" : "FAILED"}>{r.withinLimits ? t("ccp.within") : t("ccp.outside")}</Badge></td>
            <td>{r.batch?.batchNumber ?? "–"}</td>
            <td className="text-xs">{t(`recordSource.${r.source}`)}</td>
            <td>{r.deviations.map((d) => <Link key={d.id} className="link" href={`/app/deviations/${d.id}`}>{d.code}</Link>)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
