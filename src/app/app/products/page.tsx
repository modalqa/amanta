import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { listProducts } from "@/server/services/haccp";
import { getT } from "@/i18n";
import { Badge, Card, Empty, Field, Flash, PageHeader, Table } from "@/components/ui";
import { flash, type SP } from "../../_lib/server";
import { createProductAction } from "../haccp/actions";

export const metadata = { title: "Produk" };

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("haccp:read");
  const t = getT(ctx.org.locale);
  const products = await listProducts(ctx);
  return (
    <>
      <PageHeader title={t("products.title")} subtitle={t("products.subtitle")} />
      <Flash {...flash(t, await searchParams)} />
      {can(ctx, "haccp:write") && (
        <Card title={t("products.new")} className="mb-4">
          <form action={createProductAction} className="grid gap-3 md:grid-cols-3">
            <Field label={t("common.name")}><input name="name" required className="input" /></Field>
            <Field label={t("common.code")}><input name="code" className="input" /></Field>
            <Field label={t("products.bpomNumber")} hint={t("products.bpomHint")}><input name="bpomNumber" className="input" placeholder="MD 123456789012" /></Field>
            <Field label={t("products.shelfLife")}><input name="shelfLifeDays" type="number" min={0} className="input" /></Field>
            <div className="md:col-span-2"><Field label={t("common.description")}><input name="description" className="input" /></Field></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="halalCertified" className="h-4 w-4" /> {t("products.halalCertified")}</label>
            <div className="md:col-span-3"><button className="btn btn-primary">{t("common.save")}</button></div>
          </form>
        </Card>
      )}
      <Table head={[t("common.name"), t("common.code"), t("products.bpomNumber"), t("products.shelfLife"), "Halal"]} empty={products.length === 0 ? <div className="p-4"><Empty>{t("products.empty")}</Empty></div> : null}>
        {products.map((p) => (
          <tr key={p.id}><td>{p.name}<div className="text-xs text-gray-500">{p.description}</div></td><td>{p.code ?? "–"}</td><td>{p.bpomNumber ?? "–"}</td><td>{p.shelfLifeDays ?? "–"}</td><td>{p.halalCertified ? <Badge tone="green">{t("common.yes")}</Badge> : <Badge>{t("common.no")}</Badge>}</td></tr>
        ))}
      </Table>
    </>
  );
}
