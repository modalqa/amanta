import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/session";
import { getSubmission } from "@/server/services/checklists";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n";
import { Badge, Card, Flash, PageHeader, Table } from "@/components/ui";
import { displayValue, formatDateTime } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../../../_lib/server";

export default async function SubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx("checklists:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const { id } = await params;
  const s = await getSubmission(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const by = await ctx.db.membership.findFirst({ where: { userId: s.submittedById }, include: { user: { select: { name: true } } } });
  return (
    <>
      <PageHeader title={s.template.name} subtitle={`${formatDateTime(s.submittedAt, p)} · ${by?.user.name ?? ""}${s.shift ? ` · ${t("checklists.shift")} ${s.shift}` : ""}${s.batch ? ` · ${s.batch.batchNumber}` : ""}`} actions={<Link href="/app/checklists" className="btn btn-secondary">{t("common.back")}</Link>} />
      <Flash {...flash(t, await searchParams)} />
      <div className="mb-4 flex flex-wrap items-center gap-2"><Badge status={s.status}>{t(`subStatus.${s.status}`)}</Badge>{s.deviations.map((d) => <Link key={d.id} href={`/app/deviations/${d.id}`} className="link text-sm">{t("checklists.deviationOpened", { code: d.code })}</Link>)}</div>
      <Card>
        <Table head={["#", t("checklists.prompt"), t("checklists.value"), t("common.status"), t("common.notes")]}>
          {s.responses.map((r) => (
            <tr key={r.id} className={r.passed ? "" : "bg-red-50"}>
              <td>{r.item.seq}</td><td>{r.item.prompt}</td>
              <td>{r.item.type === "BOOLEAN" ? (r.valueBool == null ? "–" : r.valueBool ? t("common.yes") : t("common.no")) : r.item.type === "TEXT" ? r.valueText ?? "–" : displayValue(r.valueNumber, r.item.unit, p)}</td>
              <td><Badge status={r.passed ? "OK" : "FAILED"}>{r.passed ? "OK" : t("subStatus.FAILED")}</Badge></td>
              <td className="text-xs">{r.note ?? ""}</td>
            </tr>
          ))}
        </Table>
        {s.notes && <p className="mt-3 text-sm text-gray-700">{s.notes}</p>}
      </Card>
    </>
  );
}
