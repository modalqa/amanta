import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { getCapa } from "@/server/services/capa";
import { listAssignableUsers } from "@/server/services/accounts";
import { listEvidence } from "@/server/services/documents";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n";
import { Badge, Card, Field, Flash, PageHeader } from "@/components/ui";
import { EvidenceSection } from "@/components/evidence";
import { formatDate, formatDateTime } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../../_lib/server";
import { completeAction, rejectAction, startAction, verifyAction } from "../actions";

export default async function CapaDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx("capa:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const { id } = await params;
  const c = await getCapa(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const [users, evidence] = await Promise.all([listAssignableUsers(ctx), listEvidence(ctx, "Capa", c.id)]);
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "–";
  const isAssignee = c.assigneeId === ctx.userId;
  const canWork = can(ctx, "capa:work") && (isAssignee || can(ctx, "capa:manage"));
  return (
    <>
      <PageHeader title={`${c.code} · ${c.title}`} subtitle={`${t(`capaType.${c.type}`)} · ${c.deviation.code}`} actions={<Link href={`/app/deviations/${c.deviation.id}`} className="btn btn-secondary">{c.deviation.code}</Link>} />
      <Flash {...flash(t, await searchParams)} />
      <div className="mb-4 flex flex-wrap gap-2"><Badge status={c.status}>{t(`capaStatus.${c.status}`)}</Badge>{c.aiDrafted && <Badge tone="purple">{t("capa.aiDrafted")}</Badge>}{c.effective !== null && <Badge tone={c.effective ? "green" : "red"}>{c.effective ? t("capa.effective") : t("capa.ineffective")}</Badge>}</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("capa.details")} className="lg:col-span-2">
          <dl className="space-y-3 text-sm">
            <div><dt className="label">{t("capa.actionPlan")}</dt><dd className="whitespace-pre-wrap">{c.actionPlan}</dd></div>
            <div><dt className="label">{t("deviations.rootCause")}</dt><dd className="whitespace-pre-wrap">{c.rootCause ?? "–"}</dd></div>
            <div className="grid grid-cols-2 gap-3"><div><dt className="label">{t("capa.assignee")}</dt><dd>{name(c.assigneeId)}</dd></div><div><dt className="label">{t("capa.dueDate")}</dt><dd>{formatDate(c.dueDate, p)}</dd></div></div>
            {c.completedAt && <div><dt className="label">{t("capa.completion")}</dt><dd>{formatDateTime(c.completedAt, p)} — {c.completionNote}</dd></div>}
            {c.verifiedAt && <div><dt className="label">{t("capa.verification")}</dt><dd>{formatDateTime(c.verifiedAt, p)} · {name(c.verifiedById)} — {c.verificationNote}</dd></div>}
          </dl>
        </Card>
        <div className="space-y-4">
          {canWork && c.status === "OPEN" && <Card><form action={startAction}><input type="hidden" name="id" value={c.id} /><button className="btn btn-secondary w-full">{t("capa.start")}</button></form></Card>}
          {canWork && (c.status === "OPEN" || c.status === "IN_PROGRESS") && (
            <Card title={t("capa.complete")}>
              <form action={completeAction} className="space-y-2"><input type="hidden" name="id" value={c.id} /><textarea name="completionNote" required minLength={5} rows={3} className="input" placeholder={t("capa.completionPlaceholder")} /><button className="btn btn-primary w-full">{t("capa.markDone")}</button></form>
            </Card>
          )}
          {can(ctx, "capa:verify") && c.status === "PENDING_VERIFICATION" && (
            <Card title={t("capa.verify")}>
              {isAssignee ? <p className="text-sm text-amber-800">{t("errors.verifier_must_differ_from_assignee")}</p> : (
                <form action={verifyAction} className="space-y-2">
                  <input type="hidden" name="id" value={c.id} />
                  <Field label={t("capa.verificationNote")}><textarea name="note" required minLength={5} rows={3} className="input" /></Field>
                  <div className="flex gap-2"><button name="effective" value="yes" className="btn btn-primary">{t("capa.effective")}</button><button name="effective" value="no" className="btn btn-danger">{t("capa.ineffective")}</button></div>
                </form>
              )}
            </Card>
          )}
          {can(ctx, "capa:manage") && c.status !== "CLOSED" && c.status !== "REJECTED" && (
            <Card title={t("capa.reject")}><form action={rejectAction} className="space-y-2"><input type="hidden" name="id" value={c.id} /><input name="reason" required className="input" placeholder={t("capa.rejectReason")} /><button className="btn btn-secondary w-full">{t("capa.reject")}</button></form></Card>
          )}
        </div>
      </div>
      <EvidenceSection t={t} p={p} evidence={evidence} entityType="Capa" entityId={c.id} back={`/app/capa/${c.id}`} canUpload={can(ctx, "capa:work") && c.status !== "CLOSED"} />
    </>
  );
}
