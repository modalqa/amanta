import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { listDocuments } from "@/server/services/documents";
import { listSuppliers } from "@/server/services/suppliers";
import { getT } from "@/i18n";
import { Badge, Card, Empty, Field, Flash, PageHeader, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { flash, prefsOf, str, type SP } from "../../_lib/server";
import { uploadAction } from "./actions";
import { env } from "@/server/env";

export const metadata = { title: "Dokumen" };
const CATS = ["SOP", "HACCP_PLAN", "RECIPE", "PROCESS_FLOW", "SUPPLIER_CERTIFICATE", "COA", "SPECIFICATION", "QUALITY_RECORD", "EVIDENCE", "OTHER"];

export default async function DocumentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("documents:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const sp = await searchParams;
  const [docs, suppliers] = await Promise.all([listDocuments(ctx, { category: str(sp.category), q: str(sp.q) }), can(ctx, "documents:write") ? listSuppliers(ctx) : Promise.resolve([])]);
  return (
    <>
      <PageHeader title={t("documents.title")} subtitle={t("documents.subtitle")} />
      <Flash {...flash(t, sp)} />
      {can(ctx, "documents:write") && (
        <Card title={t("documents.upload")} className="mb-4">
          <form action={uploadAction} className="grid gap-3 md:grid-cols-4" encType="multipart/form-data">
            <Field label={t("documents.file")} hint={t("documents.fileHint", { mb: env().UPLOAD_MAX_MB })}><input type="file" name="file" required accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.png,.jpg,.jpeg" className="input" /></Field>
            <Field label={t("documents.docTitle")}><input name="title" className="input" maxLength={200} placeholder={t("documents.titlePlaceholder")} /></Field>
            <Field label={t("documents.category")}>
              <select name="category" className="input" defaultValue="SOP">{CATS.map((c) => <option key={c} value={c}>{t(`docCategory.${c}`)}</option>)}</select>
            </Field>
            <Field label={t("documents.supplierOptional")}>
              <select name="supplierId" className="input" defaultValue=""><option value="">–</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </Field>
            <div className="md:col-span-4"><button className="btn btn-primary">{t("documents.uploadButton")}</button></div>
          </form>
        </Card>
      )}
      <form className="mb-3 flex flex-wrap gap-2">
        <input name="q" defaultValue={str(sp.q)} placeholder={t("common.search")} className="input max-w-xs" />
        <select name="category" defaultValue={str(sp.category) ?? ""} className="input max-w-xs"><option value="">{t("common.allCategories")}</option>{CATS.map((c) => <option key={c} value={c}>{t(`docCategory.${c}`)}</option>)}</select>
        <button className="btn btn-secondary">{t("common.filter")}</button>
      </form>
      <Table head={[t("documents.docTitle"), t("documents.category"), t("common.status"), t("documents.file"), t("common.createdAt")]} empty={docs.length === 0 ? <div className="p-4"><Empty>{t("documents.empty")}</Empty></div> : null}>
        {docs.map((d) => (
          <tr key={d.id}>
            <td><Link className="link" href={`/app/documents/${d.id}`}>{d.title}</Link>{d.supplier && <div className="text-xs text-gray-500">{d.supplier.name}</div>}</td>
            <td>{t(`docCategory.${d.category}`)}</td>
            <td><Badge status={d.status}>{t(`docStatus.${d.status}`)}</Badge></td>
            <td className="text-xs text-gray-600">{d.originalName}<br />{Math.round(d.sizeBytes / 1024)} KB</td>
            <td className="text-xs">{formatDateTime(d.createdAt, p)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
