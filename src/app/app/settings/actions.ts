"use server";
import { requireCtx } from "@/server/auth/session";
import { createApiKey, removeAiConfig, revokeApiKey, setAiConfig, testAiConnection, updateOrgSettings } from "@/server/services/settings";
import { inviteMember, updateMember } from "@/server/services/accounts";
import { env } from "@/server/env";
import { fd, runAction } from "../../_lib/server";
import { cookies } from "next/headers";

export async function orgSettingsAction(form: FormData) {
  await runAction("/app/settings", async () => {
    const ctx = await requireCtx("org:manage");
    await updateOrgSettings(ctx, { name: fd(form, "name"), legalName: fd(form, "legalName"), nib: fd(form, "nib"), address: fd(form, "address"), province: fd(form, "province"), timezone: fd(form, "timezone"), locale: fd(form, "locale"), dateFormat: fd(form, "dateFormat"), temperatureUnit: fd(form, "temperatureUnit"), weightUnit: fd(form, "weightUnit") } as never);
  });
}

export async function inviteAction(form: FormData) {
  await runAction("/app/settings/members", async () => {
    const ctx = await requireCtx("members:manage");
    const { token } = await inviteMember(ctx, { email: fd(form, "email"), role: fd(form, "role") as never });
    // Show the one-time invite link once via a short-lived httpOnly cookie (never in the URL/logs).
    (await cookies()).set("amanta_flash_invite", `${env().APP_URL}/invite/${token}`, { httpOnly: true, sameSite: "strict", maxAge: 120, path: "/app/settings/members", secure: env().COOKIE_SECURE === "true" });
    return "/app/settings/members?ok=invited";
  });
}

export async function memberAction(form: FormData) {
  await runAction("/app/settings/members", async () => {
    const ctx = await requireCtx("members:manage");
    const op = fd(form, "op");
    await updateMember(ctx, fd(form, "membershipId"), op === "deactivate" ? { active: false } : op === "activate" ? { active: true } : { role: fd(form, "role") as never });
  });
}

export async function createApiKeyAction(form: FormData) {
  await runAction("/app/settings/api-keys", async () => {
    const ctx = await requireCtx("apikeys:manage");
    const { key } = await createApiKey(ctx, { name: fd(form, "name"), scopes: form.getAll("scopes").map(String) as never, expiresInDays: Number(fd(form, "expiresInDays") || 365) });
    (await cookies()).set("amanta_flash_apikey", key, { httpOnly: true, sameSite: "strict", maxAge: 120, path: "/app/settings/api-keys", secure: env().COOKIE_SECURE === "true" });
    return "/app/settings/api-keys?ok=apikey_created";
  });
}

export async function revokeApiKeyAction(form: FormData) {
  await runAction("/app/settings/api-keys", async () => { await revokeApiKey(await requireCtx("apikeys:manage"), fd(form, "id")); });
}

export async function aiConfigAction(form: FormData) {
  await runAction("/app/settings/ai", async () => {
    const ctx = await requireCtx("ai:configure");
    await setAiConfig(ctx, { provider: fd(form, "provider") as never, model: fd(form, "model"), baseUrl: fd(form, "baseUrl"), apiKey: fd(form, "apiKey") });
  });
}

export async function aiRemoveConfigAction() {
  await runAction("/app/settings/ai", async () => { await removeAiConfig(await requireCtx("ai:configure")); }, "ai_removed");
}

export async function aiTestAction() {
  await runAction("/app/settings/ai", async () => { await testAiConnection(await requireCtx("ai:configure")); }, "ai_test_ok");
}
