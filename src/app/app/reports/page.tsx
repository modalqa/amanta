import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { getT } from "@/i18n";
import { Card, Field, Flash, PageHeader } from "@/components/ui";
import { flash, type SP } from "../../_lib/server";
import { isoDateOffset } from "@/lib/dates";

export const metadata = { title: "Laporan" };

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("reports:read");
  const t = getT(ctx.org.locale);
  const batches = await ctx.db.batch.findMany({ select: { id: true, batchNumber: true }, orderBy: { productionDate: "desc" }, take: 200 });
  const to = isoDateOffset(0);
  const from = isoDateOffset(-30);
  const range = (<><Field label={t("reports.from")}><input type="date" name="from" defaultValue={from} className="input" /></Field><Field label={t("reports.to")}><input type="date" name="to" defaultValue={to} className="input" /></Field></>);
  const reports: Array<{ kind: string; formats: string[]; range?: boolean; batch?: boolean; perm?: boolean }> = [
    { kind: "audit-package", formats: ["pdf"], range: true },
    { kind: "haccp-plan", formats: ["pdf"] },
    { kind: "ccp-log", formats: ["pdf", "csv"], range: true },
    { kind: "deviations-capa", formats: ["pdf", "xlsx"], range: true },
    { kind: "batch-trace", formats: ["pdf"], batch: true },
    { kind: "suppliers", formats: ["xlsx", "csv"] },
    { kind: "audit-trail", formats: ["csv"], range: true, perm: can(ctx, "audit:read") },
  ];
  return (
    <>
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} />
      <Flash {...flash(t, await searchParams)} />
      <div className="grid gap-4 md:grid-cols-2">
        {reports.filter((r) => r.perm !== false).map((r) => (
          <Card key={r.kind} title={t(`reports.kind.${r.kind}`)}>
            <p className="mb-3 text-sm text-gray-600">{t(`reports.desc.${r.kind}`)}</p>
            <form action="/app/reports/download" method="get" className="grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="kind" value={r.kind} />
              {r.range && range}
              {r.batch && <div className="sm:col-span-2"><Field label={t("nav.batches")}><select name="batchId" required className="input">{batches.map((b) => <option key={b.id} value={b.id}>{b.batchNumber}</option>)}</select></Field></div>}
              <Field label={t("reports.format")}><select name="format" className="input">{r.formats.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select></Field>
              <div className="flex items-end sm:col-span-3"><button className="btn btn-primary" disabled={r.batch && batches.length === 0}>{t("reports.download")}</button></div>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
