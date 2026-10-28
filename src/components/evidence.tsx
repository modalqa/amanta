import { Card, Field } from "@/components/ui";
import type { TFn } from "@/i18n";
import { formatDateTime, type FormatPrefs } from "@/lib/format";
import { uploadEvidenceAction } from "@/app/app/documents/actions";

type Ev = { id: string; note: string | null; createdAt: Date; document: { id: string; title: string; originalName: string } };

export function EvidenceSection({ t, p, evidence, entityType, entityId, back, canUpload }: { t: TFn; p: FormatPrefs; evidence: Ev[]; entityType: string; entityId: string; back: string; canUpload: boolean }) {
  return (
    <Card title={t("evidence.title")} className="mt-4">
      {evidence.length === 0 ? <p className="text-sm text-gray-500">{t("evidence.none")}</p> : (
        <ul className="space-y-1 text-sm">
          {evidence.map((e) => <li key={e.id}><a className="link" href={`/app/documents/${e.document.id}/download`}>{e.document.title}</a> <span className="text-xs text-gray-500">· {formatDateTime(e.createdAt, p)}{e.note ? ` · ${e.note}` : ""}</span></li>)}
        </ul>
      )}
      {canUpload && (
        <form action={uploadEvidenceAction} className="mt-3 grid gap-2 md:grid-cols-4" encType="multipart/form-data">
          <input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} /><input type="hidden" name="back" value={back} />
          <Field label={t("documents.file")}><input type="file" name="file" required accept=".pdf,.docx,.xlsx,.txt,.csv,.png,.jpg,.jpeg" className="input" /></Field>
          <Field label={t("documents.docTitle")}><input name="title" className="input" /></Field>
          <Field label={t("common.notes")}><input name="note" className="input" /></Field>
          <div className="flex items-end"><button className="btn btn-secondary">{t("evidence.upload")}</button></div>
        </form>
      )}
    </Card>
  );
}
