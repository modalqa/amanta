import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { getDocument } from "@/server/services/documents";
import { getAiStatus } from "@/server/ai";
import { getT } from "@/i18n";
import { AppError } from "@/server/errors";
import { Badge, Card, Flash, PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatDateTime } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../../_lib/server";
import { aiAction, reprocessAction } from "../actions";

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx("documents:read");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const { id } = await params;
  const doc = await getDocument(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const ai = await getAiStatus(ctx.orgId);
  const pending = doc.status === "UPLOADED" || doc.status === "PROCESSING" || doc.aiRuns.some((r) => r.status === "QUEUED" || r.status === "RUNNING");
  const [controlCount, templateIds] = await Promise.all([
    ctx.db.haccpControl.count({ where: { documentId: doc.id } }),
    ctx.db.checklistTemplate.findMany({ where: { aiRun: { documentId: doc.id } }, select: { id: true, name: true, status: true } }),
  ]);
  return (
    <>
      {pending && <AutoRefresh seconds={3} label={t("common.processing")} />}
      <PageHeader title={doc.title} subtitle={`${t(`docCategory.${doc.category}`)} · ${doc.originalName}`} actions={<a className="btn btn-secondary" href={`/app/documents/${doc.id}/download`}>{t("documents.download")}</a>} />
      <Flash {...flash(t, await searchParams)} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("documents.details")}>
          <dl className="space-y-2 text-sm">
            <div><dt className="label">{t("common.status")}</dt><dd><Badge status={doc.status}>{t(`docStatus.${doc.status}`)}</Badge>{doc.extractionError && <div className="mt-1 text-xs text-amber-700">{t(`extractWarn.${doc.extractionError.split(",")[0]}`)}</div>}</dd></div>
            <div><dt className="label">SHA-256</dt><dd className="break-all font-mono text-xs">{doc.sha256}</dd></div>
            <div><dt className="label">{t("documents.size")}</dt><dd>{Math.round(doc.sizeBytes / 1024)} KB{doc.pageCount ? ` · ${doc.pageCount} ${t("documents.pages")}` : ""}</dd></div>
            <div><dt className="label">{t("common.createdAt")}</dt><dd>{formatDateTime(doc.createdAt, p)}</dd></div>
            {doc.supplier && <div><dt className="label">{t("nav.suppliers")}</dt><dd><Link className="link" href={`/app/suppliers/${doc.supplier.id}`}>{doc.supplier.name}</Link></dd></div>}
          </dl>
          {can(ctx, "documents:write") && (doc.status === "FAILED" || doc.status === "EXTRACTED") && (
            <form action={reprocessAction} className="mt-3"><input type="hidden" name="documentId" value={doc.id} /><button className="btn btn-secondary text-xs">{t("documents.reprocess")}</button></form>
          )}
        </Card>
        <Card title={t("documents.aiAssist")} className="lg:col-span-2">
          {!ai.configured ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("ai.notConfigured")} {can(ctx, "ai:configure") && <Link className="link" href="/app/settings/ai">{t("ai.configureLink")}</Link>}</div>
          ) : (
            <p className="mb-3 text-sm text-gray-600">{t("documents.aiExplain", { provider: ai.provider, model: ai.model ?? "" })}</p>
          )}
          {can(ctx, "ai:run") && (
            <div className="flex flex-wrap gap-2">
              <form action={aiAction}><input type="hidden" name="documentId" value={doc.id} /><input type="hidden" name="kind" value="HACCP_FROM_DOCUMENT" /><button className="btn btn-primary" disabled={doc.status !== "EXTRACTED" || !doc.extractedText}>{t("documents.generateHaccp")}</button></form>
              <form action={aiAction}><input type="hidden" name="documentId" value={doc.id} /><input type="hidden" name="kind" value="CHECKLIST_FROM_DOCUMENT" /><button className="btn btn-secondary" disabled={doc.status !== "EXTRACTED" || !doc.extractedText}>{t("documents.generateChecklist")}</button></form>
            </div>
          )}
          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-gray-500">{t("documents.aiRuns")}</h3>
          {doc.aiRuns.length === 0 ? <p className="text-sm text-gray-500">–</p> : (
            <ul className="space-y-2 text-sm">
              {doc.aiRuns.map((r) => (
                <li key={r.id} className="rounded border border-gray-100 p-2">
                  <div className="flex flex-wrap items-center gap-2"><Badge status={r.status}>{t(`aiStatus.${r.status}`)}</Badge><span>{t(`aiKind.${r.kind}`)}</span><span className="text-xs text-gray-500">{formatDateTime(r.createdAt, p)}{r.model ? ` · ${r.provider}/${r.model}` : ""}{r.inputTokens ? ` · ${r.inputTokens}+${r.outputTokens} token` : ""}</span></div>
                  {r.status === "FAILED" && <div className="mt-1 text-xs text-red-700">{t(`errors.${r.errorCode === "AI_NOT_CONFIGURED" ? "ai_not_configured" : "ai_failed"}`)} <span className="text-gray-500">({r.errorMessage?.slice(0, 200)})</span></div>}
                  {r.status === "SUCCEEDED" && (r.output as { warnings?: string[] } | null)?.warnings?.length ? <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">{(r.output as { warnings: string[] }).warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
                </li>
              ))}
            </ul>
          )}
          {(controlCount > 0 || templateIds.length > 0) && (
            <div className="mt-4 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm">
              {controlCount > 0 && <div><Link className="link font-medium" href={`/app/haccp?documentId=${doc.id}`}>{t("documents.reviewControls", { n: controlCount })}</Link></div>}
              {templateIds.map((tp) => <div key={tp.id}><Link className="link" href={`/app/checklists/${tp.id}`}>{t("documents.reviewChecklist", { name: tp.name })}</Link> <Badge status={tp.status}>{t(`tplStatus.${tp.status}`)}</Badge></div>)}
            </div>
          )}
        </Card>
      </div>
      <Card title={t("documents.extractedText")} className="mt-4">
        {doc.extractedText ? <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{doc.extractedText.slice(0, 50000)}</pre> : <p className="text-sm text-gray-500">{t("documents.noText")}</p>}
      </Card>
    </>
  );
}
