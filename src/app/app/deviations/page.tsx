import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { listDeviations } from "@/server/services/deviations";
import { getT } from "@/i18n";
import { Badge, Empty, Field, Flash, PageHeader, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { flash, prefsOf, str, type SP } from "../../_lib/server";
import { reportAction } from "./actions";

export const metadata = { title: "Deviasi" };

export default async function DeviationsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("deviations:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const sp = await searchParams;
  const [devs, batches, suppliers] = await Promise.all([
    listDeviations(ctx, { open: str(sp.open) === "1" }),
    ctx.db.batch.findMany({ select: { id: true, batchNumber: true }, orderBy: { productionDate: "desc" }, take: 100 }),
    ctx.db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title={t("deviations.title")} subtitle={t("deviations.subtitle")} actions={<a className="btn btn-secondary" href="/app/reports/download?kind=deviations-capa&format=xlsx">{t("deviations.exportXlsx")}</a>} />
      <Flash {...flash(t, sp)} />
      {can(ctx, "deviations:create") && (
        <details className="card mb-4">
          <summary className="cursor-pointer text-sm font-semibold">{t("deviations.report")}</summary>
          <form action={reportAction} className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2"><Field label={t("common.title")}><input name="title" required minLength={3} className="input" /></Field></div>
            <Field label={t("deviations.severity")}><select name="severity" className="input" defaultValue="MEDIUM">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{t(`severity.${s}`)}</option>)}</select></Field>
            <div className="md:col-span-3"><Field label={t("common.description")}><textarea name="description" required rows={3} className="input" /></Field></div>
            <Field label={t("deviations.source")}><select name="source" className="input">{["MANUAL", "SUPPLIER", "CUSTOMER_COMPLAINT", "AUDIT"].map((s) => <option key={s} value={s}>{t(`devSource.${s}`)}</option>)}</select></Field>
            <Field label={t("nav.batches")}><select name="batchId" className="input"><option value="">–</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.batchNumber}</option>)}</select></Field>
            <Field label={t("nav.suppliers")}><select name="supplierId" className="input"><option value="">–</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <div className="md:col-span-2"><Field label={t("deviations.immediateAction")}><input name="immediateAction" className="input" /></Field></div>
            <Field label={t("deviations.occurredAt")}><input type="datetime-local" name="occurredAt" className="input" /></Field>
            <div className="md:col-span-3"><button className="btn btn-primary">{t("deviations.submit")}</button></div>
          </form>
        </details>
      )}
      <div className="mb-3 flex gap-2 text-sm"><Link className={`btn ${str(sp.open) === "1" ? "btn-secondary" : "btn-primary"}`} href="/app/deviations">{t("common.all")}</Link><Link className={`btn ${str(sp.open) === "1" ? "btn-primary" : "btn-secondary"}`} href="/app/deviations?open=1">{t("deviations.openOnly")}</Link></div>
      <Table head={[t("common.code"), t("common.title"), t("deviations.severity"), t("common.status"), t("deviations.disposition"), "CAPA", t("common.createdAt")]} empty={devs.length === 0 ? <div className="p-4"><Empty>{t("deviations.empty")}</Empty></div> : null}>
        {devs.map((d) => (
          <tr key={d.id}>
            <td className="whitespace-nowrap"><Link className="link" href={`/app/deviations/${d.id}`}>{d.code}</Link></td>
            <td>{d.title}<div className="text-xs text-gray-500">{t(`devSource.${d.source}`)}{d.batch ? ` · ${d.batch.batchNumber}` : ""}{d.haccpControl?.ccpCode ? ` · ${d.haccpControl.ccpCode}` : ""}</div></td>
            <td><Badge status={d.severity}>{t(`severity.${d.severity}`)}</Badge></td>
            <td><Badge status={d.status}>{t(`devStatus.${d.status}`)}</Badge></td>
            <td><Badge status={d.disposition}>{t(`disposition.${d.disposition}`)}</Badge></td>
            <td>{d._count.capas}</td>
            <td className="text-xs">{formatDateTime(d.createdAt, p)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
