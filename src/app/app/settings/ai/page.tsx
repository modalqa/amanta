import { requireCtx } from "@/server/auth/session";
import { getAiStatus, getOrgAiConfig } from "@/server/ai";
import { getT } from "@/i18n";
import { Badge, Card, Field, Flash, PageHeader } from "@/components/ui";
import { flash, type SP } from "../../../_lib/server";
import { aiConfigAction, aiRemoveConfigAction, aiTestAction } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "AI" };

export default async function AiSettingsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("ai:configure");
  const t = getT(ctx.org.locale);
  const [status, cfg] = await Promise.all([getAiStatus(ctx.orgId), getOrgAiConfig(ctx.orgId)]);
  const provider = cfg?.provider ?? "anthropic";
  return (
    <>
      <PageHeader title={t("settings.title")} />
      <SettingsTabs t={t} active="/app/settings/ai" admin />
      <Flash {...flash(t, await searchParams)} />
      <Card title={t("settings.aiStatus")} className="mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Badge tone={status.configured ? "green" : "amber"}>{status.configured ? t("settings.aiReady") : t("settings.aiNotReady")}</Badge>
          {status.provider !== "none" && <span>{t("settings.aiProvider")}: <strong>{t(`settings.aiProviders.${status.provider}`)}</strong></span>}
          {status.model && <span>{t("settings.aiModel")}: <code>{status.model}</code></span>}
          <span>{t("settings.aiKeySource")}: {t(`settings.aiSource.${status.source}`)}</span>
        </div>
        {status.configured && (
          <form action={aiTestAction} className="mt-3"><button className="btn btn-secondary">{t("settings.aiTest")}</button></form>
        )}
      </Card>
      {status.byokEnabled ? (
        <Card title={t("settings.aiByokTitle")}>
          <p className="mb-4 max-w-2xl text-sm text-gray-600">{t("settings.aiByokHelp")}</p>
          <form action={aiConfigAction} className="grid max-w-2xl gap-4">
            <Field label={t("settings.aiProvider")}>
              <select name="provider" defaultValue={provider} className="input">
                <option value="anthropic">{t("settings.aiProviders.anthropic")}</option>
                <option value="openai">{t("settings.aiProviders.openai")}</option>
              </select>
            </Field>
            <Field label={t("settings.aiModel")} hint={t("settings.aiModelHint")}>
              <input name="model" required defaultValue={cfg?.model ?? ""} placeholder="claude-sonnet-5-5" className="input" autoComplete="off" />
            </Field>
            <Field label={t("settings.aiBaseUrl")} hint={t("settings.aiBaseUrlHint")}>
              <input name="baseUrl" type="url" defaultValue={cfg?.baseUrl ?? ""} placeholder="https://api.openai.com/v1" className="input" autoComplete="off" />
            </Field>
            <Field label="API key" hint={cfg?.keyHint ? t("settings.aiKeyStored", { hint: cfg.keyHint }) : t("settings.aiKeyHint")}>
              <input name="apiKey" type="password" autoComplete="off" className="input" />
            </Field>
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{t("settings.aiDataNotice")}</p>
            <div><button className="btn btn-primary">{t("settings.aiSave")}</button></div>
          </form>
          {status.source === "organization" && (
            <form action={aiRemoveConfigAction} className="mt-4 border-t border-gray-100 pt-3">
              <button className="text-sm text-red-700 hover:underline">{t("settings.aiRemoveKey")}</button>
            </form>
          )}
        </Card>
      ) : (
        <Card title={t("settings.aiByokTitle")}><p className="text-sm text-gray-600">{t("settings.aiByokDisabled")}</p></Card>
      )}
    </>
  );
}
