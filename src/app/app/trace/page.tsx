import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { searchTrace, traceLotForward } from "@/server/services/traceability";
import { getT } from "@/i18n";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { prefsOf, str, type SP } from "../../_lib/server";

export const metadata = { title: "Telusur" };

export default async function TracePage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("traceability:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const sp = await searchParams;
  const q = str(sp.q) ?? "";
  const lotId = str(sp.lot);
  const [results, lot] = await Promise.all([q ? searchTrace(ctx, q) : null, lotId ? traceLotForward(ctx, lotId).catch(() => null) : null]);
  return (
    <>
      <PageHeader title={t("trace.title")} subtitle={t("trace.subtitle")} />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder={t("trace.searchPlaceholder")} className="input max-w-md" /><button className="btn btn-primary">{t("common.search")}</button></form>
      {results && (
        <Card title={t("trace.results")} className="mb-4">
          {results.batches.length + results.lots.length === 0 ? <Empty>{t("trace.noResults")}</Empty> : (
            <ul className="space-y-1 text-sm">
              {results.batches.map((b) => <li key={b.id}>{t("nav.batches")}: <Link className="link" href={`/app/batches/${b.id}`}>{b.batchNumber}</Link> · {b.product.name}</li>)}
              {results.lots.map((l) => <li key={l.id}>{t("nav.lots")}: <Link className="link" href={`/app/trace?lot=${l.id}`}>{l.lotNumber}</Link> · {l.ingredient.name}</li>)}
            </ul>
          )}
        </Card>
      )}
      {lot && (
        <Card title={t("trace.forwardFor", { lot: lot.lotNumber, ingredient: lot.ingredient.name })}>
          <p className="mb-3 text-sm text-gray-600">{t("nav.suppliers")}: {lot.supplier?.name ?? "–"} · {t("lots.receivedAt")} {formatDate(lot.receivedAt, p)} · <Badge status={lot.status}>{t(`lotStatus.${lot.status}`)}</Badge></p>
          {lot.batchInputs.length === 0 ? <Empty>{t("trace.notUsed")}</Empty> : (
            <ul className="space-y-3 text-sm">
              {lot.batchInputs.map((bi) => (
                <li key={bi.id} className="rounded border border-gray-200 p-3">
                  <Link className="link font-medium" href={`/app/batches/${bi.batch.id}`}>{bi.batch.batchNumber}</Link> · {bi.batch.product.name} · {bi.quantity} {bi.unit} <Badge status={bi.batch.status}>{t(`batchStatus.${bi.batch.status}`)}</Badge>
                  <ul className="ml-4 mt-1 list-disc text-xs text-gray-700">{bi.batch.shipments.map((s) => <li key={s.id}>{formatDate(s.shippedAt, p)} → {s.customer}{s.destination ? ` (${s.destination})` : ""}: {s.quantity} {s.unit}</li>)}{bi.batch.shipments.length === 0 && <li>{t("trace.notShipped")}</li>}</ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
