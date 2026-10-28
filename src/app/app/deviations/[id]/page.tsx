import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { getDeviation } from "@/server/services/deviations";
import { listAssignableUsers } from "@/server/services/accounts";
import { listEvidence } from "@/server/services/documents";
import { getAiStatus } from "@/server/ai";
import { capaDraftSchema } from "@/server/ai/prompts";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n";
import { Badge, Card, Field, Flash, PageHeader, Table } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { displayValue, formatDate, formatDateTime } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../../_lib/server";
import { acceptDraftAction, capaDraftAction, closeAction, createCapaAction, investigationAction } from "../actions";
import { EvidenceSection } from "@/components/evidence";
import { isoDateOffset } from "@/lib/dates";

export default async function DeviationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx("deviations:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const { id } = await params;
  const d = await getDeviation(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const [users, evidence, ai] = await Promise.all([listAssignableUsers(ctx), listEvidence(ctx, "Deviation", d.id), getAiStatus(ctx.orgId)]);
  const userName = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "–";
  const lastRun = d.aiRuns[0];
  const pending = lastRun && (lastRun.status === "QUEUED" || lastRun.status === "RUNNING");
  const draft = lastRun?.status === "SUCCEEDED" ? capaDraftSchema.safeParse(lastRun.output) : null;
  const draftItems = draft?.success ? [...draft.data.corrective.map((c) => ({ ...c, type: "CORRECTIVE" })), ...draft.data.preventive.map((c) => ({ ...c, type: "PREVENTIVE" }))] : [];
  const closed = d.status === "CLOSED";
  const tomorrow = isoDateOffset(7);
  return (
    <>
      {pending && <AutoRefresh label={t("common.processing")} />}
      <PageHeader title={`${d.code} · ${d.title}`} subtitle={`${t(`devSource.${d.source}`)} · ${formatDateTime(d.occurredAt, p)} · ${t("deviations.reportedBy")} ${userName(d.reportedById)}`} actions={<Link href="/app/deviations" className="btn btn-secondary">{t("common.back")}</Link>} />
      <Flash {...flash(t, await searchParams)} />
      <div className="mb-4 flex flex-wrap gap-2"><Badge status={d.severity}>{t(`severity.${d.severity}`)}</Badge><Badge status={d.status}>{t(`devStatus.${d.status}`)}</Badge><Badge status={d.disposition}>{t("deviations.disposition")}: {t(`disposition.${d.disposition}`)}</Badge></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("deviations.details")} className="lg:col-span-2">
          <p className="whitespace-pre-wrap text-sm">{d.description}</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {d.haccpControl && <div><dt className="label">CCP</dt><dd><Link className="link" href={`/app/haccp/${d.haccpControl.id}`}>{d.haccpControl.ccpCode} – {d.haccpControl.processStep}</Link><div className="text-xs text-gray-600">{t("deviations.definedCorrection")}: {d.haccpControl.correctiveAction}</div></dd></div>}
            {d.ccpRecord && <div><dt className="label">{t("ccp.value")}</dt><dd>{displayValue(d.ccpRecord.value, d.ccpRecord.unit, p)} ({formatDateTime(d.ccpRecord.recordedAt, p)})</dd></div>}
            {d.batch && <div><dt className="label">{t("nav.batches")}</dt><dd><Link className="link" href={`/app/batches/${d.batch.id}`}>{d.batch.batchNumber}</Link> <Badge status={d.batch.status}>{t(`batchStatus.${d.batch.status}`)}</Badge></dd></div>}
            {d.supplier && <div><dt className="label">{t("nav.suppliers")}</dt><dd><Link className="link" href={`/app/suppliers/${d.supplier.id}`}>{d.supplier.name}</Link></dd></div>}
            {d.submission && <div><dt className="label">{t("nav.checklists")}</dt><dd><Link className="link" href={`/app/checklists/submissions/${d.submission.id}`}>{d.submission.template.name}</Link></dd></div>}
            {d.closedAt && <div className="sm:col-span-2"><dt className="label">{t("deviations.closure")}</dt><dd>{formatDateTime(d.closedAt, p)} · {userName(d.closedById)} — {d.closureNote}</dd></div>}
          </dl>
        </Card>
        <Card title={t("deviations.investigation")}>
          {can(ctx, "deviations:manage") && !closed ? (
            <form action={investigationAction} className="space-y-2">
              <input type="hidden" name="id" value={d.id} />
              <Field label={t("deviations.immediateAction")}><textarea name="immediateAction" defaultValue={d.immediateAction ?? ""} rows={2} className="input" /></Field>
              <Field label={t("deviations.rootCause")}><textarea name="rootCause" defaultValue={d.rootCause ?? ""} rows={3} className="input" /></Field>
              <Field label={t("deviations.disposition")}><select name="disposition" defaultValue={d.disposition} className="input">{["PENDING", "HOLD", "RELEASE", "REWORK", "DESTROY"].map((x) => <option key={x} value={x}>{t(`disposition.${x}`)}</option>)}</select></Field>
              <button className="btn btn-primary">{t("common.save")}</button>
            </form>
          ) : (
            <dl className="space-y-2 text-sm"><div><dt className="label">{t("deviations.immediateAction")}</dt><dd>{d.immediateAction ?? "–"}</dd></div><div><dt className="label">{t("deviations.rootCause")}</dt><dd className="whitespace-pre-wrap">{d.rootCause ?? "–"}</dd></div></dl>
          )}
        </Card>
      </div>

      <Card title="CAPA" className="mt-4">
        <Table head={[t("common.code"), t("capa.type"), t("common.title"), t("capa.assignee"), t("capa.dueDate"), t("common.status")]} empty={d.capas.length === 0 ? <p className="p-3 text-sm text-gray-500">{t("capa.none")}</p> : null}>
          {d.capas.map((c) => (
            <tr key={c.id}>
              <td><Link className="link" href={`/app/capa/${c.id}`}>{c.code}</Link></td><td>{t(`capaType.${c.type}`)}{c.aiDrafted && <> <Badge tone="purple">AI</Badge></>}</td>
              <td>{c.title}</td><td>{userName(c.assigneeId)}</td><td className="text-xs">{formatDate(c.dueDate, p)}</td><td><Badge status={c.status}>{t(`capaStatus.${c.status}`)}</Badge></td>
            </tr>
          ))}
        </Table>
        {!closed && can(ctx, "capa:manage") && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-purple-200 bg-purple-50/40 p-3">
              <h3 className="mb-2 text-sm font-semibold">{t("deviations.aiCapa")}</h3>
              {!ai.configured ? <p className="text-sm text-amber-800">{t("ai.notConfigured")}</p> : can(ctx, "ai:run") && (
                <form action={capaDraftAction}><input type="hidden" name="id" value={d.id} /><button className="btn btn-secondary" disabled={!!pending}>{t("deviations.generateCapa")}</button></form>
              )}
              {lastRun?.status === "FAILED" && <p className="mt-2 text-xs text-red-700">{t("errors.ai_failed")} ({lastRun.errorMessage?.slice(0, 160)})</p>}
              {draft?.success && (
                <form action={acceptDraftAction} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={d.id} /><input type="hidden" name="aiRunId" value={lastRun!.id} />
                  <p className="whitespace-pre-wrap rounded bg-white p-2 text-xs"><strong>{t("deviations.rootCauseAnalysis")}:</strong> {draft.data.rootCauseAnalysis}</p>
                  {draftItems.map((it, i) => (
                    <label key={i} className="flex gap-2 rounded bg-white p-2 text-sm"><input type="checkbox" name="pick" value={i} defaultChecked className="mt-1" /><span><strong>{t(`capaType.${it.type}`)}: {it.title}</strong> <span className="text-xs text-gray-500">(+{it.dueInDays} {t("common.days")})</span><br /><span className="text-xs">{it.actionPlan}</span></span></label>
                  ))}
                  <Field label={t("capa.assignee")}><select name="assigneeId" required className="input">{users.map((u) => <option key={u.id} value={u.id}>{u.name} ({t(`roles.${u.role}`)})</option>)}</select></Field>
                  <button className="btn btn-primary">{t("deviations.acceptDraft")}</button>
                  <p className="text-xs text-gray-500">{t("deviations.aiReviewNote")}</p>
                </form>
              )}
            </div>
            <form action={createCapaAction} className="space-y-2 rounded-md border border-gray-200 p-3">
              <h3 className="text-sm font-semibold">{t("capa.newManual")}</h3>
              <input type="hidden" name="id" value={d.id} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={t("capa.type")}><select name="type" className="input"><option value="CORRECTIVE">{t("capaType.CORRECTIVE")}</option><option value="PREVENTIVE">{t("capaType.PREVENTIVE")}</option></select></Field>
                <Field label={t("capa.dueDate")}><input type="date" name="dueDate" required defaultValue={tomorrow} className="input" /></Field>
              </div>
              <Field label={t("common.title")}><input name="title" required className="input" /></Field>
              <Field label={t("capa.actionPlan")}><textarea name="actionPlan" required rows={2} className="input" /></Field>
              <Field label={t("capa.assignee")}><select name="assigneeId" required className="input">{users.map((u) => <option key={u.id} value={u.id}>{u.name} ({t(`roles.${u.role}`)})</option>)}</select></Field>
              <button className="btn btn-primary">{t("capa.create")}</button>
            </form>
          </div>
        )}
      </Card>

      <EvidenceSection t={t} p={p} evidence={evidence} entityType="Deviation" entityId={d.id} back={`/app/deviations/${d.id}`} canUpload={can(ctx, "deviations:create") && !closed} />

      {!closed && can(ctx, "deviations:close") && (
        <Card title={t("deviations.close")} className="mt-4">
          <p className="mb-2 text-xs text-gray-600">{t("deviations.closeHelp")}</p>
          <form action={closeAction} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={d.id} /><input name="closureNote" required className="input max-w-xl" placeholder={t("deviations.closureNote")} /><button className="btn btn-primary">{t("deviations.closeButton")}</button></form>
        </Card>
      )}
    </>
  );
}
