import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { listSuppliers } from "@/server/services/suppliers";
import { getT } from "@/i18n";
import { Badge, Empty, Field, Flash, PageHeader, Table } from "@/components/ui";
import { flash, type SP } from "../../_lib/server";
import { createSupplierAction } from "./actions";

export const metadata = { title: "Pemasok" };

export default async function SuppliersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("suppliers:read");
  const t = getT(ctx.org.locale);
  const suppliers = await listSuppliers(ctx);
  return (
    <>
      <PageHeader title={t("suppliers.title")} subtitle={t("suppliers.subtitle")} actions={<a className="btn btn-secondary" href="/app/reports/download?kind=suppliers&format=xlsx">{t("suppliers.exportXlsx")}</a>} />
      <Flash {...flash(t, await searchParams)} />
      {can(ctx, "suppliers:write") && (
        <details className="card mb-4">
          <summary className="cursor-pointer text-sm font-semibold">{t("suppliers.new")}</summary>
          <form action={createSupplierAction} className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label={t("common.name")}><input name="name" required className="input" /></Field>
            <Field label={t("common.code")}><input name="code" className="input" /></Field>
            <Field label={t("suppliers.riskLevel")}><select name="riskLevel" defaultValue="MEDIUM" className="input">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{t(`severity.${s}`)}</option>)}</select></Field>
            <Field label={t("suppliers.contact")}><input name="contactName" className="input" /></Field>
            <Field label={t("auth.email")}><input name="email" type="email" className="input" /></Field>
            <Field label={t("suppliers.phone")}><input name="phone" className="input" /></Field>
            <div className="md:col-span-3"><Field label={t("suppliers.address")}><input name="address" className="input" /></Field></div>
            <div className="md:col-span-3"><button className="btn btn-primary">{t("common.save")}</button></div>
          </form>
        </details>
      )}
      <Table head={[t("common.name"), t("common.status"), t("suppliers.riskLevel"), t("suppliers.certificates"), "Halal", t("nav.ingredients")]} empty={suppliers.length === 0 ? <div className="p-4"><Empty>{t("suppliers.empty")}</Empty></div> : null}>
        {suppliers.map((s) => (
          <tr key={s.id}>
            <td><Link className="link" href={`/app/suppliers/${s.id}`}>{s.name}</Link>{s.code && <div className="text-xs text-gray-500">{s.code}</div>}</td>
            <td><Badge status={s.status}>{t(`supplierStatus.${s.status}`)}</Badge></td>
            <td><Badge status={s.riskLevel}>{t(`severity.${s.riskLevel}`)}</Badge></td>
            <td className="text-xs">{s.certSummary.total}{s.certSummary.expired > 0 && <> · <Badge status="EXPIRED">{s.certSummary.expired} {t("certState.EXPIRED")}</Badge></>}{s.certSummary.expiring > 0 && <> · <Badge status="EXPIRING">{s.certSummary.expiring} {t("certState.EXPIRING")}</Badge></>}</td>
            <td>{s.certSummary.hasHalal ? <Badge tone="green">{t("common.yes")}</Badge> : <Badge>–</Badge>}</td>
            <td>{s._count.ingredients}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
