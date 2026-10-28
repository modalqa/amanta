import { requireCtx } from "@/server/auth/session";
import { getAiStatus } from "@/server/ai";
import { getT } from "@/i18n";
import { Badge, Card, Field, Flash, PageHeader } from "@/components/ui";
import { flash, type SP } from "../../../_lib/server";
import { aiKeyAction } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "AI" };

export default async function AiSettingsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("ai:configure");
  const t = getT(ctx.org.locale);
  const status = await getAiStatus(ctx.orgId);
  return (
    <>
      <PageHeader title={t("settings.title")} />
      <SettingsTabs t={t} active="/app/settings/ai" admin />
      <Flash {...flash(t, await searchParams)} />
      <Card title={t("settings.aiStatus")} className="mb-4">
        <div className="flex flex-wrap gap-2 text-sm"><Badge tone={status.configured ? "green" : "amber"}>{status.configured ? t("settings.aiReady") : t("settings.aiNotReady")}</Badge><span>{t("settings.aiProvider")}: <code>{status.provider}</code></span>{status.model && <span>{t("settings.aiModel")}: <code>{status.model}</code></span>}<span>{t("settings.aiKeySource")}: {t(`settings.aiSource.${status.source}`)}</span></div>
        <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-line">{t("settings.aiHelp")}</div>
      </Card>
      {status.provider !== "none" && (
        <Card title={t("settings.aiOrgKey")}>
          <p className="mb-2 text-sm text-gray-600">{t("settings.aiOrgKeyHelp")}</p>
          <form action={aiKeyAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="op" value="set" />
            <Field label="API key"><input name="apiKey" type="password" autoComplete="off" required className="input min-w-[320px]" /></Field>
            <button className="btn btn-primary">{t("common.save")}</button>
          </form>
          {status.source === "organization" && <form action={aiKeyAction} className="mt-2"><input type="hidden" name="op" value="remove" /><button className="text-xs text-red-700 hover:underline">{t("settings.aiRemoveKey")}</button></form>}
        </Card>
      )}
    </>
  );
}
