import { cookies } from "next/headers";
import { requireCtx } from "@/server/auth/session";
import { API_SCOPES, listApiKeys } from "@/server/services/settings";
import { getT } from "@/i18n";
import { Badge, Card, Field, Flash, PageHeader, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../../_lib/server";
import { createApiKeyAction, revokeApiKeyAction } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "API key" };

export default async function ApiKeysPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("apikeys:manage");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const keys = await listApiKeys(ctx);
  const newKey = (await cookies()).get("amanta_flash_apikey")?.value;
  return (
    <>
      <PageHeader title={t("settings.title")} />
      <SettingsTabs t={t} active="/app/settings/api-keys" admin />
      <Flash {...flash(t, await searchParams)} />
      {newKey && <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"><div className="font-medium">{t("settings.apiKeyOnce")}</div><code className="mt-1 block break-all rounded bg-white p-2 text-xs">{newKey}</code></div>}
      <Card title={t("settings.newApiKey")} className="mb-4">
        <form action={createApiKeyAction} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={t("common.name")}><input name="name" required className="input" placeholder="Sensor suhu lini 1" /></Field>
            <Field label={t("settings.expiresInDays")}><input name="expiresInDays" type="number" min={1} max={730} defaultValue={365} className="input" /></Field>
          </div>
          <div><span className="label">{t("settings.scopes")}</span><div className="flex flex-wrap gap-3">{API_SCOPES.map((s) => <label key={s} className="flex items-center gap-1 text-sm"><input type="checkbox" name="scopes" value={s} /> <code className="text-xs">{s}</code></label>)}</div></div>
          <button className="btn btn-primary">{t("settings.createKey")}</button>
        </form>
        <p className="mt-3 text-xs text-gray-500">{t("settings.apiDocs")} <a className="link" href="/api/v1/openapi.json">/api/v1/openapi.json</a></p>
      </Card>
      <Table head={[t("common.name"), "Prefix", t("settings.scopes"), t("settings.lastUsed"), t("settings.expires"), t("common.status"), ""]}>
        {keys.map((k) => {
          const active = !k.revokedAt && (!k.expiresAt || k.expiresAt > new Date());
          return (
            <tr key={k.id}>
              <td>{k.name}</td><td className="font-mono text-xs">amk_{k.prefix}_…</td><td className="text-xs">{k.scopes.join(", ")}</td>
              <td className="text-xs">{formatDateTime(k.lastUsedAt, p)}</td><td className="text-xs">{formatDateTime(k.expiresAt, p)}</td>
              <td><Badge tone={active ? "green" : "gray"}>{active ? t("settings.active") : k.revokedAt ? t("settings.revoked") : t("certState.EXPIRED")}</Badge></td>
              <td>{!k.revokedAt && <form action={revokeApiKeyAction}><input type="hidden" name="id" value={k.id} /><button className="text-xs text-red-700 hover:underline">{t("settings.revoke")}</button></form>}</td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
