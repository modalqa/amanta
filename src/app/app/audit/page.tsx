import { requireCtx } from "@/server/auth/session";
import { verifyAuditChain } from "@/server/audit";
import { getT } from "@/i18n";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { prefsOf, str, type SP } from "../../_lib/server";

export const metadata = { title: "Jejak audit" };

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("audit:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const sp = await searchParams;
  const entity = str(sp.entity);
  const action = str(sp.action);
  const page = Math.max(1, Number(str(sp.page) ?? 1) || 1);
  const where = { ...(entity ? { entityType: entity } : {}), ...(action ? { action: { contains: action } } : {}) };
  const [logs, total, chain, members, entities] = await Promise.all([
    ctx.db.auditLog.findMany({ where, orderBy: { seq: "desc" }, take: 100, skip: (page - 1) * 100 }),
    ctx.db.auditLog.count({ where }),
    str(sp.verify) === "1" ? verifyAuditChain(ctx.orgId) : Promise.resolve(null),
    ctx.db.membership.findMany({ include: { user: { select: { id: true, name: true } } } }),
    ctx.db.auditLog.groupBy({ by: ["entityType"], _count: true }),
  ]);
  const who = (uid: string | null, kid: string | null) => (uid ? members.find((m) => m.user.id === uid)?.user.name ?? uid : kid ? `API ${kid.slice(0, 6)}` : t("audit.system"));
  return (
    <>
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} actions={<><a href="/app/audit?verify=1" className="btn btn-secondary">{t("audit.verify")}</a><a href="/app/reports/download?kind=audit-trail&format=csv" className="btn btn-secondary">CSV</a></>} />
      {chain && <Card className="mb-4"><Badge tone={chain.ok ? "green" : "red"}>{chain.ok ? t("audit.chainOk", { n: chain.checked }) : t("audit.chainBroken", { seq: chain.brokenAtSeq ?? "?" })}</Badge></Card>}
      <form className="mb-3 flex flex-wrap gap-2">
        <select name="entity" defaultValue={entity ?? ""} className="input max-w-xs"><option value="">{t("audit.allEntities")}</option>{entities.map((e) => <option key={e.entityType} value={e.entityType}>{e.entityType} ({e._count})</option>)}</select>
        <input name="action" defaultValue={action ?? ""} placeholder={t("audit.action")} className="input max-w-xs" />
        <button className="btn btn-secondary">{t("common.filter")}</button>
      </form>
      <Table head={["#", t("common.time"), t("audit.actor"), t("audit.action"), t("audit.entity"), t("audit.summary"), "Hash"]}>
        {logs.map((l) => (
          <tr key={l.id}>
            <td className="text-xs">{l.seq}</td><td className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt, p)}</td><td className="text-xs">{who(l.actorUserId, l.actorApiKeyId)}</td>
            <td className="font-mono text-xs">{l.action}</td><td className="text-xs">{l.entityType}{l.entityId ? <span className="text-gray-400"> {l.entityId.slice(0, 10)}</span> : null}</td>
            <td className="max-w-md text-xs">{l.summary}{l.metadata ? <details><summary className="cursor-pointer text-gray-500">meta</summary><pre className="whitespace-pre-wrap text-[10px]">{JSON.stringify(l.metadata, null, 1).slice(0, 2000)}</pre></details> : null}</td>
            <td className="font-mono text-[10px] text-gray-500">{l.hash.slice(0, 12)}</td>
          </tr>
        ))}
      </Table>
      <div className="mt-3 flex gap-2 text-sm">
        {page > 1 && <a className="btn btn-secondary" href={`?page=${page - 1}${entity ? `&entity=${entity}` : ""}`}>←</a>}
        <span className="py-2">{page} / {Math.max(1, Math.ceil(total / 100))}</span>
        {page * 100 < total && <a className="btn btn-secondary" href={`?page=${page + 1}${entity ? `&entity=${entity}` : ""}`}>→</a>}
      </div>
    </>
  );
}
