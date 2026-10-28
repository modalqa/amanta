import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { listIngredients } from "@/server/services/traceability";
import { getT } from "@/i18n";
import { Badge, Card, Empty, Field, Flash, PageHeader, Table } from "@/components/ui";
import { flash, type SP } from "../../_lib/server";
import { createIngredientAction } from "../batches/actions";

export const metadata = { title: "Bahan" };

export default async function IngredientsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("traceability:read");
  const t = getT(ctx.org.locale);
  const [items, suppliers] = await Promise.all([listIngredients(ctx), ctx.db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader title={t("ingredients.title")} subtitle={t("ingredients.subtitle")} />
      <Flash {...flash(t, await searchParams)} />
      {can(ctx, "traceability:write") && (
        <Card title={t("ingredients.new")} className="mb-4">
          <form action={createIngredientAction} className="grid gap-3 md:grid-cols-4">
            <Field label={t("common.name")}><input name="name" required className="input" /></Field>
            <Field label={t("common.code")}><input name="code" className="input" /></Field>
            <Field label={t("ingredients.mainSupplier")}><select name="supplierId" className="input"><option value="">–</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label={t("ingredients.unit")}><input name="unit" defaultValue="kg" className="input" /></Field>
            <div className="md:col-span-2"><Field label={t("ingredients.allergens")} hint={t("ingredients.allergensHint")}><input name="allergens" className="input" placeholder="gluten, telur, susu" /></Field></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="halalCritical" className="h-4 w-4" /> {t("ingredients.halalCritical")}</label>
            <div className="md:col-span-4"><Field label={t("ingredients.specification")}><textarea name="specification" rows={2} className="input" /></Field></div>
            <div className="md:col-span-4"><button className="btn btn-primary">{t("common.save")}</button></div>
          </form>
        </Card>
      )}
      <Table head={[t("common.name"), t("ingredients.mainSupplier"), t("ingredients.allergens"), t("ingredients.halalCritical"), t("nav.lots")]} empty={items.length === 0 ? <div className="p-4"><Empty>{t("ingredients.empty")}</Empty></div> : null}>
        {items.map((i) => (
          <tr key={i.id}><td>{i.name}{i.code && <div className="text-xs text-gray-500">{i.code}</div>}</td><td>{i.supplier?.name ?? "–"}</td><td>{i.allergens.map((a) => <Badge key={a} tone="amber">{a}</Badge>)}</td><td>{i.halalCritical ? <Badge tone="amber">{t("common.yes")}</Badge> : "–"}</td><td>{i._count.lots}</td></tr>
        ))}
      </Table>
    </>
  );
}
