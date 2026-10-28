import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { listSubmissions, listTemplates } from "@/server/services/checklists";
import { getT } from "@/i18n";
import { Badge, Card, Empty, Flash, PageHeader, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../_lib/server";
import { daysAgo } from "@/lib/dates";

export const metadata = { title: "Checklist" };

export default async function ChecklistsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("checklists:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const [templates, subs] = await Promise.all([listTemplates(ctx), listSubmissions(ctx, { since: daysAgo(14) })]);
  const active = templates.filter((x) => x.status === "ACTIVE");
  return (
    <>
      <PageHeader title={t("checklists.title")} subtitle={t("checklists.subtitle")} actions={can(ctx, "checklists:manage") ? <Link href="/app/checklists/new" className="btn btn-primary">{t("checklists.new")}</Link> : null} />
      <Flash {...flash(t, await searchParams)} />
      {can(ctx, "checklists:submit") && (
        <Card title={t("checklists.runNow")} className="mb-4">
          {active.length === 0 ? <Empty>{t("checklists.noActive")}</Empty> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((x) => <Link key={x.id} href={`/app/checklists/${x.id}/run`} className="btn btn-secondary min-h-14 justify-start text-left"><span><span className="block font-medium">{x.name}</span><span className="text-xs text-gray-500">{x._count.items} item · {t(`frequency.${x.frequency}`)}</span></span></Link>)}
            </div>
          )}
        </Card>
      )}
      <Card title={t("checklists.templates")} className="mb-4">
        <Table head={[t("common.name"), t("common.status"), t("haccp.source"), t("checklists.items"), t("checklists.submissions")]} empty={templates.length === 0 ? <div className="p-4"><Empty>{t("checklists.emptyTemplates")}</Empty></div> : null}>
          {templates.map((x) => (
            <tr key={x.id}>
              <td><Link className="link" href={`/app/checklists/${x.id}`}>{x.name}</Link></td>
              <td><Badge status={x.status}>{t(`tplStatus.${x.status}`)}</Badge></td>
              <td>{x.source === "AI" ? <Badge tone="purple">AI</Badge> : t("haccp.manual")}</td>
              <td>{x._count.items}</td>
              <td>{x._count.submissions}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={t("checklists.recentSubmissions")}>
        <Table head={[t("common.time"), t("nav.checklists"), t("checklists.shift"), t("nav.batches"), t("common.status"), t("nav.deviations")]} empty={subs.length === 0 ? <div className="p-4"><Empty>{t("checklists.noSubmissions")}</Empty></div> : null}>
          {subs.map((s) => (
            <tr key={s.id}>
              <td className="text-xs"><Link className="link" href={`/app/checklists/submissions/${s.id}`}>{formatDateTime(s.submittedAt, p)}</Link></td>
              <td>{s.template.name}</td><td>{s.shift ?? "–"}</td><td>{s.batch?.batchNumber ?? "–"}</td>
              <td><Badge status={s.status}>{t(`subStatus.${s.status}`)}</Badge></td>
              <td>{s.deviations.map((d) => <Link key={d.id} className="link mr-1" href={`/app/deviations/${d.id}`}>{d.code}</Link>)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
