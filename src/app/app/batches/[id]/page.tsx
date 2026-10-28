import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { getBatch } from "@/server/services/traceability";
import { listEvidence } from "@/server/services/documents";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n";
import { Badge, Card, Field, Flash, PageHeader, Table } from "@/components/ui";
import { EvidenceSection } from "@/components/evidence";
import { displayValue, formatDate, formatDateTime } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../../_lib/server";
import { batchStatusAction, shipmentAction } from "../actions";

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx("traceability:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const { id } = await params;
  const b = await getBatch(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const evidence = await listEvidence(ctx, "Batch", b.id);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title={`${t("nav.batches")} ${b.batchNumber}`} subtitle={`${b.product.name} · ${formatDate(b.productionDate, p)} · ${b.quantity} ${b.unit}`} actions={<>
        <a className="btn btn-secondary" href={`/app/reports/download?kind=batch-trace&format=pdf&batchId=${b.id}`}>{t("batches.traceReport")}</a>
        <Link href="/app/batches" className="btn btn-secondary">{t("common.back")}</Link>
      </>} />
      <Flash {...flash(t, await searchParams)} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge status={b.status}>{t(`batchStatus.${b.status}`)}</Badge>
        {can(ctx, "deviations:close") && (
          <form action={batchStatusAction} className="flex gap-2"><input type="hidden" name="id" value={b.id} />
            <select name="status" defaultValue={b.status} className="input py-1 text-xs">{["IN_PRODUCTION", "ON_HOLD", "RELEASED", "REJECTED"].map((s) => <option key={s} value={s}>{t(`batchStatus.${s}`)}</option>)}</select>
            <button className="btn btn-secondary px-2 py-1 text-xs">{t("batches.setStatus")}</button>
          </form>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("batches.backwardTrace")}>
          <Table head={[t("nav.ingredients"), t("lots.lotNumber"), t("nav.suppliers"), t("common.quantity")]} empty={b.inputs.length === 0 ? <p className="p-3 text-sm text-gray-500">–</p> : null}>
            {b.inputs.map((i) => <tr key={i.id}><td>{i.lot.ingredient.name}</td><td className="font-mono text-xs"><Link className="link" href={`/app/trace?lot=${i.lot.id}`}>{i.lot.lotNumber}</Link></td><td>{i.lot.supplier ? <Link className="link" href={`/app/suppliers/${i.lot.supplier.id}`}>{i.lot.supplier.name}</Link> : "–"}</td><td>{i.quantity} {i.unit}</td></tr>)}
          </Table>
        </Card>
        <Card title={t("batches.forwardTrace")}>
          <Table head={[t("common.date"), t("batches.customer"), t("batches.destination"), t("common.quantity")]} empty={b.shipments.length === 0 ? <p className="p-3 text-sm text-gray-500">–</p> : null}>
            {b.shipments.map((s) => <tr key={s.id}><td className="text-xs">{formatDate(s.shippedAt, p)}</td><td>{s.customer}</td><td>{s.destination ?? "–"}</td><td>{s.quantity} {s.unit}</td></tr>)}
          </Table>
          {can(ctx, "traceability:write") && (b.status === "RELEASED" || b.status === "SHIPPED") && (
            <form action={shipmentAction} className="mt-3 grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="batchId" value={b.id} />
              <Field label={t("batches.customer")}><input name="customer" required className="input" /></Field>
              <Field label={t("batches.destination")}><input name="destination" className="input" /></Field>
              <Field label={t("common.date")}><input type="date" name="shippedAt" defaultValue={today} required className="input" /></Field>
              <Field label={t("common.quantity")}><input name="quantity" inputMode="decimal" required className="input" /></Field>
              <Field label={t("ingredients.unit")}><input name="unit" defaultValue={b.unit} className="input" /></Field>
              <div className="flex items-end"><button className="btn btn-primary">{t("batches.ship")}</button></div>
            </form>
          )}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("nav.ccp")}>
          <ul className="space-y-1 text-sm">{b.ccpRecords.map((r) => <li key={r.id} className={r.withinLimits ? "" : "text-red-700"}>{formatDateTime(r.recordedAt, p)} · {r.haccpControl.ccpCode} · {displayValue(r.value, r.unit, p)} {r.withinLimits ? "" : `(${t("ccp.outside")})`}</li>)}{b.ccpRecords.length === 0 && <li className="text-gray-500">–</li>}</ul>
        </Card>
        <Card title={t("nav.checklists")}>
          <ul className="space-y-1 text-sm">{b.submissions.map((s) => <li key={s.id}><Link className="link" href={`/app/checklists/submissions/${s.id}`}>{s.template.name}</Link> · {formatDateTime(s.submittedAt, p)} <Badge status={s.status}>{t(`subStatus.${s.status}`)}</Badge></li>)}{b.submissions.length === 0 && <li className="text-gray-500">–</li>}</ul>
          <h3 className="mb-1 mt-3 text-xs font-semibold uppercase text-gray-500">{t("nav.deviations")}</h3>
          <ul className="space-y-1 text-sm">{b.deviations.map((d) => <li key={d.id}><Link className="link" href={`/app/deviations/${d.id}`}>{d.code}</Link> {d.title} <Badge status={d.status}>{t(`devStatus.${d.status}`)}</Badge></li>)}{b.deviations.length === 0 && <li className="text-gray-500">–</li>}</ul>
        </Card>
      </div>
      <EvidenceSection t={t} p={p} evidence={evidence} entityType="Batch" entityId={b.id} back={`/app/batches/${b.id}`} canUpload={can(ctx, "deviations:create")} />
    </>
  );
}
