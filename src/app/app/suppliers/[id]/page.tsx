import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { certificateState, getSupplier } from "@/server/services/suppliers";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n";
import { Badge, Card, Field, Flash, PageHeader, Table } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../../_lib/server";
import { addCertificateAction, deleteCertificateAction, updateSupplierAction } from "../actions";

const CERT_TYPES = ["HALAL", "BPOM", "SPP_IRT", "SNI", "ISO_22000", "FSSC_22000", "HACCP", "GMP", "COA", "NIB", "OTHER"];

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx("suppliers:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const { id } = await params;
  const s = await getSupplier(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const write = can(ctx, "suppliers:write");
  return (
    <>
      <PageHeader title={s.name} subtitle={[s.code, s.contactName, s.email, s.phone].filter(Boolean).join(" · ")} actions={<Link href="/app/suppliers" className="btn btn-secondary">{t("common.back")}</Link>} />
      <Flash {...flash(t, await searchParams)} />
      <div className="mb-4 flex gap-2"><Badge status={s.status}>{t(`supplierStatus.${s.status}`)}</Badge><Badge status={s.riskLevel}>{t("suppliers.riskLevel")}: {t(`severity.${s.riskLevel}`)}</Badge></div>
      <Card title={t("suppliers.certificates")} className="mb-4">
        <Table head={[t("suppliers.certType"), t("suppliers.certNumber"), t("suppliers.issuer"), t("suppliers.validUntil"), t("common.status"), t("nav.documents"), ""]} empty={s.certificates.length === 0 ? <p className="p-3 text-sm text-gray-500">{t("suppliers.noCertificates")}</p> : null}>
          {s.certificates.map((c) => {
            const st = certificateState(c.expiresAt);
            return (
              <tr key={c.id}>
                <td>{t(`certType.${c.type}`)}</td><td className="font-mono text-xs">{c.number}</td><td>{c.issuer ?? "–"}</td><td>{formatDate(c.expiresAt, p)}</td>
                <td><Badge status={st}>{t(`certState.${st}`)}</Badge></td>
                <td>{c.document ? <a className="link" href={`/app/documents/${c.document.id}/download`}>{t("documents.download")}</a> : "–"}</td>
                <td>{write && <form action={deleteCertificateAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="supplierId" value={s.id} /><button className="text-xs text-red-700 hover:underline">{t("common.remove")}</button></form>}</td>
              </tr>
            );
          })}
        </Table>
        {write && (
          <form action={addCertificateAction} className="mt-3 grid gap-2 md:grid-cols-4" encType="multipart/form-data">
            <input type="hidden" name="supplierId" value={s.id} />
            <Field label={t("suppliers.certType")}><select name="type" className="input">{CERT_TYPES.map((c) => <option key={c} value={c}>{t(`certType.${c}`)}</option>)}</select></Field>
            <Field label={t("suppliers.certNumber")}><input name="number" required className="input" /></Field>
            <Field label={t("suppliers.issuer")}><input name="issuer" className="input" placeholder="BPJPH / BPOM / LSPro" /></Field>
            <Field label={t("documents.file")}><input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg" className="input" /></Field>
            <Field label={t("suppliers.issuedAt")}><input type="date" name="issuedAt" className="input" /></Field>
            <Field label={t("suppliers.validUntil")}><input type="date" name="expiresAt" className="input" /></Field>
            <div className="md:col-span-2 flex items-end"><button className="btn btn-primary">{t("suppliers.addCertificate")}</button></div>
          </form>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("nav.ingredients")}>
          <ul className="text-sm">{s.ingredients.map((i) => <li key={i.id}>{i.name}{i.halalCritical && <> <Badge tone="amber">{t("ingredients.halalCritical")}</Badge></>}</li>)}{s.ingredients.length === 0 && <li className="text-gray-500">–</li>}</ul>
        </Card>
        <Card title={t("suppliers.recentLots")}>
          <ul className="text-sm">{s.lots.map((l) => <li key={l.id}>{l.lotNumber} · {l.ingredient.name} · {formatDate(l.receivedAt, p)} <Badge status={l.status}>{t(`lotStatus.${l.status}`)}</Badge></li>)}{s.lots.length === 0 && <li className="text-gray-500">–</li>}</ul>
        </Card>
      </div>
      {s.deviations.length > 0 && <Card title={t("nav.deviations")} className="mt-4"><ul className="text-sm">{s.deviations.map((d) => <li key={d.id}><Link className="link" href={`/app/deviations/${d.id}`}>{d.code}</Link> {d.title} <Badge status={d.status}>{t(`devStatus.${d.status}`)}</Badge></li>)}</ul></Card>}
      {write && (
        <Card title={t("suppliers.edit")} className="mt-4">
          <form action={updateSupplierAction} className="grid gap-3 md:grid-cols-3">
            <input type="hidden" name="id" value={s.id} />
            <Field label={t("common.name")}><input name="name" defaultValue={s.name} required className="input" /></Field>
            <Field label={t("common.code")}><input name="code" defaultValue={s.code ?? ""} className="input" /></Field>
            <Field label={t("common.status")} hint={t("suppliers.approvalHint")}><select name="status" defaultValue={s.status} className="input">{["PENDING", "APPROVED", "SUSPENDED"].map((x) => <option key={x} value={x}>{t(`supplierStatus.${x}`)}</option>)}</select></Field>
            <Field label={t("suppliers.riskLevel")}><select name="riskLevel" defaultValue={s.riskLevel} className="input">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((x) => <option key={x} value={x}>{t(`severity.${x}`)}</option>)}</select></Field>
            <Field label={t("suppliers.contact")}><input name="contactName" defaultValue={s.contactName ?? ""} className="input" /></Field>
            <Field label={t("auth.email")}><input name="email" type="email" defaultValue={s.email ?? ""} className="input" /></Field>
            <Field label={t("suppliers.phone")}><input name="phone" defaultValue={s.phone ?? ""} className="input" /></Field>
            <div className="md:col-span-2"><Field label={t("suppliers.address")}><input name="address" defaultValue={s.address ?? ""} className="input" /></Field></div>
            <div className="md:col-span-3"><Field label={t("common.notes")}><textarea name="notes" defaultValue={s.notes ?? ""} rows={2} className="input" /></Field></div>
            <div className="md:col-span-3"><button className="btn btn-primary">{t("common.saveChanges")}</button></div>
          </form>
        </Card>
      )}
    </>
  );
}
