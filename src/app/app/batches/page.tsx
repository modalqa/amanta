import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { listBatches } from "@/server/services/traceability";
import { getT } from "@/i18n";
import { Badge, Empty, Field, Flash, PageHeader, Table } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../_lib/server";
import { createBatchAction } from "./actions";

export const metadata = { title: "Batch produksi" };

export default async function BatchesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("traceability:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const [batches, products, lots] = await Promise.all([
    listBatches(ctx),
    ctx.db.product.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ctx.db.ingredientLot.findMany({ where: { status: "RELEASED" }, select: { id: true, lotNumber: true, unit: true, ingredient: { select: { name: true } } }, orderBy: { receivedAt: "desc" }, take: 200 }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title={t("batches.title")} subtitle={t("batches.subtitle")} />
      <Flash {...flash(t, await searchParams)} />
      {can(ctx, "traceability:write") && (
        <details className="card mb-4">
          <summary className="cursor-pointer text-sm font-semibold">{t("batches.new")}</summary>
          {products.length === 0 ? <p className="mt-2 text-sm text-gray-500">{t("batches.needProduct")} <Link className="link" href="/app/products">{t("nav.products")}</Link></p> : (
            <form action={createBatchAction} className="mt-3 grid gap-3 md:grid-cols-4">
              <Field label={t("batches.batchNumber")}><input name="batchNumber" required className="input" /></Field>
              <Field label={t("haccp.product")}><select name="productId" required className="input">{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label={t("batches.productionDate")}><input type="date" name="productionDate" defaultValue={today} required className="input" /></Field>
              <Field label={t("lots.expiry")}><input type="date" name="expiryDate" className="input" /></Field>
              <Field label={t("common.quantity")}><input name="quantity" inputMode="decimal" required className="input" /></Field>
              <Field label={t("ingredients.unit")}><input name="unit" defaultValue="kg" className="input" /></Field>
              <Field label={t("checklists.line")}><input name="line" className="input" /></Field>
              <Field label={t("common.notes")}><input name="notes" className="input" /></Field>
              <div className="md:col-span-4">
                <span className="label">{t("batches.inputs")}</span>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="mb-2 grid gap-2 sm:grid-cols-4">
                    <select name="lotId" className="input sm:col-span-2"><option value="">–</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.lotNumber} · {l.ingredient.name}</option>)}</select>
                    <input name="lotQty" inputMode="decimal" placeholder={t("common.quantity")} className="input" />
                    <input name="lotUnit" defaultValue="kg" className="input" />
                  </div>
                ))}
                <p className="text-xs text-gray-500">{t("batches.inputsHint")}</p>
              </div>
              <div className="md:col-span-4"><button className="btn btn-primary">{t("common.save")}</button></div>
            </form>
          )}
        </details>
      )}
      <Table head={[t("batches.batchNumber"), t("haccp.product"), t("batches.productionDate"), t("common.quantity"), t("common.status"), t("batches.inputs"), t("nav.deviations")]} empty={batches.length === 0 ? <div className="p-4"><Empty>{t("batches.empty")}</Empty></div> : null}>
        {batches.map((b) => (
          <tr key={b.id}>
            <td className="font-mono text-xs"><Link className="link" href={`/app/batches/${b.id}`}>{b.batchNumber}</Link></td><td>{b.product.name}</td><td className="text-xs">{formatDate(b.productionDate, p)}</td>
            <td>{b.quantity} {b.unit}</td><td><Badge status={b.status}>{t(`batchStatus.${b.status}`)}</Badge></td><td>{b._count.inputs}</td><td>{b._count.deviations}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
