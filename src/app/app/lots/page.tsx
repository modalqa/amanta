import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { listLots } from "@/server/services/traceability";
import { getT } from "@/i18n";
import { Badge, Card, Empty, Field, Flash, PageHeader, Table } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../_lib/server";
import { lotStatusAction, receiveLotAction } from "../batches/actions";

export const metadata = { title: "Lot bahan" };

export default async function LotsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("traceability:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const [lots, ingredients, suppliers] = await Promise.all([listLots(ctx), ctx.db.ingredient.findMany({ select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } }), ctx.db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title={t("lots.title")} subtitle={t("lots.subtitle")} />
      <Flash {...flash(t, await searchParams)} />
      {can(ctx, "traceability:write") && (
        <Card title={t("lots.receive")} className="mb-4">
          <form action={receiveLotAction} className="grid gap-3 md:grid-cols-4">
            <Field label={t("nav.ingredients")}><select name="ingredientId" required className="input">{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
            <Field label={t("nav.suppliers")}><select name="supplierId" className="input"><option value="">–</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label={t("lots.lotNumber")}><input name="lotNumber" required className="input" /></Field>
            <Field label={t("lots.receivedAt")}><input type="date" name="receivedAt" required defaultValue={today} className="input" /></Field>
            <Field label={t("common.quantity")}><input name="quantity" inputMode="decimal" required className="input" /></Field>
            <Field label={t("ingredients.unit")}><input name="unit" defaultValue="kg" required className="input" /></Field>
            <Field label={t("lots.expiry")}><input type="date" name="expiryDate" className="input" /></Field>
            <Field label={t("common.notes")}><input name="notes" className="input" /></Field>
            <div className="md:col-span-4"><button className="btn btn-primary" disabled={ingredients.length === 0}>{t("lots.receiveButton")}</button>{ingredients.length === 0 && <span className="ml-2 text-sm text-gray-500">{t("lots.needIngredient")} <Link className="link" href="/app/ingredients">{t("nav.ingredients")}</Link></span>}</div>
          </form>
        </Card>
      )}
      <Table head={[t("lots.lotNumber"), t("nav.ingredients"), t("nav.suppliers"), t("lots.receivedAt"), t("common.quantity"), t("lots.expiry"), t("common.status"), ""]} empty={lots.length === 0 ? <div className="p-4"><Empty>{t("lots.empty")}</Empty></div> : null}>
        {lots.map((l) => (
          <tr key={l.id}>
            <td className="font-mono text-xs"><Link className="link" href={`/app/trace?lot=${l.id}`}>{l.lotNumber}</Link></td>
            <td>{l.ingredient.name}{l.ingredient.halalCritical && <> <Badge tone="amber">Halal</Badge></>}</td><td>{l.supplier?.name ?? "–"}</td>
            <td className="text-xs">{formatDate(l.receivedAt, p)}</td><td>{l.quantity} {l.unit}</td><td className="text-xs">{formatDate(l.expiryDate, p)}</td>
            <td><Badge status={l.status}>{t(`lotStatus.${l.status}`)}</Badge></td>
            <td>{can(ctx, "suppliers:write") && l.status === "QUARANTINE" && (
              <div className="flex gap-1">
                <form action={lotStatusAction}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value="RELEASED" /><button className="btn btn-secondary px-2 py-1 text-xs">{t("lots.release")}</button></form>
                <form action={lotStatusAction}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value="REJECTED" /><button className="btn btn-secondary px-2 py-1 text-xs text-red-700">{t("lots.reject")}</button></form>
              </div>
            )}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
