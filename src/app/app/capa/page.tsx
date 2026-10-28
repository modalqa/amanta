import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { listCapas } from "@/server/services/capa";
import { listAssignableUsers } from "@/server/services/accounts";
import { getT } from "@/i18n";
import { Badge, Empty, Flash, PageHeader, Table } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { flash, prefsOf, str, type SP } from "../../_lib/server";

export const metadata = { title: "CAPA" };

export default async function CapaPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("capa:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const sp = await searchParams;
  const mine = str(sp.mine) === "1", overdue = str(sp.overdue) === "1";
  const [capas, users] = await Promise.all([listCapas(ctx, { mine, overdue }), listAssignableUsers(ctx)]);
  const now = new Date();
  const tab = (href: string, label: string, active: boolean) => <Link href={href} className={`btn ${active ? "btn-primary" : "btn-secondary"}`}>{label}</Link>;
  return (
    <>
      <PageHeader title={t("capa.title")} subtitle={t("capa.subtitle")} />
      <Flash {...flash(t, sp)} />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">{tab("/app/capa", t("common.all"), !mine && !overdue)}{tab("/app/capa?mine=1", t("capa.mine"), mine)}{tab("/app/capa?overdue=1", t("capa.overdue"), overdue)}</div>
      <Table head={[t("common.code"), t("common.title"), t("nav.deviations"), t("capa.assignee"), t("capa.dueDate"), t("common.status")]} empty={capas.length === 0 ? <div className="p-4"><Empty>{t("capa.none")}</Empty></div> : null}>
        {capas.map((c) => {
          const late = (c.status === "OPEN" || c.status === "IN_PROGRESS") && c.dueDate < now;
          return (
            <tr key={c.id}>
              <td><Link className="link" href={`/app/capa/${c.id}`}>{c.code}</Link></td>
              <td>{c.title}<div className="text-xs text-gray-500">{t(`capaType.${c.type}`)}</div></td>
              <td><Link className="link" href={`/app/deviations/${c.deviation.id}`}>{c.deviation.code}</Link></td>
              <td>{users.find((u) => u.id === c.assigneeId)?.name ?? "–"}</td>
              <td className={`text-xs ${late ? "font-semibold text-red-700" : ""}`}>{formatDate(c.dueDate, p)}{late && ` (${t("capa.late")})`}</td>
              <td><Badge status={c.status}>{t(`capaStatus.${c.status}`)}</Badge></td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
