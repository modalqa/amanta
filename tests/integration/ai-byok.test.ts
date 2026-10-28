import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { resetDb, makeOrg, ctxFor } from "../helpers/db";
import { removeAiConfig, setAiConfig } from "@/server/services/settings";
import { AI_CONFIG_NAME, AI_SECRET_NAME, getAiProvider, getAiStatus } from "@/server/ai";
import { resetEnvCache } from "@/server/env";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  resetEnvCache();
}

describe("AI bring-your-own-key (per organization)", () => {
  beforeEach(async () => { await resetDb(); setEnv({ AI_PROVIDER: "none", AI_BYOK_ENABLED: undefined, AI_BYOK_ALLOW_PRIVATE_URLS: undefined }); });
  afterEach(() => setEnv({ AI_PROVIDER: "none", AI_BYOK_ENABLED: undefined, AI_BYOK_ALLOW_PRIVATE_URLS: undefined }));

  it("lets an organization admin use their own provider even when the server has no AI", async () => {
    const org = await makeOrg();
    const owner = await ctxFor(org.id, "OWNER");
    expect((await getAiStatus(org.id)).configured).toBe(false);

    await setAiConfig(owner, { provider: "anthropic", model: "claude-sonnet-5-5", baseUrl: "", apiKey: "sk-ant-SECRET-abcd" });
    const status = await getAiStatus(org.id);
    expect(status).toMatchObject({ configured: true, provider: "anthropic", model: "claude-sonnet-5-5", source: "organization", keyHint: "abcd" });
    const provider = await getAiProvider(org.id);
    expect(provider).toMatchObject({ name: "anthropic", model: "claude-sonnet-5-5" });

    // The key and the config are stored encrypted, and the key never reaches the audit log.
    const rows = await prisma.orgSecret.findMany({ where: { organizationId: org.id } });
    expect(rows.map((r) => r.name).sort()).toEqual([AI_CONFIG_NAME, AI_SECRET_NAME].sort());
    expect(JSON.stringify(rows)).not.toContain("SECRET");
    expect(JSON.stringify(rows)).not.toContain("claude-sonnet");
    const audit = await prisma.auditLog.findMany({ where: { organizationId: org.id } });
    expect(audit.some((a) => a.action === "ai.config_set")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("SECRET");
  });

  it("only Owner/Admin can configure AI", async () => {
    const org = await makeOrg();
    for (const role of ["QA_MANAGER", "SUPERVISOR", "OPERATOR", "AUDITOR"] as const) {
      await expect(setAiConfig(await ctxFor(org.id, role), { provider: "anthropic", model: "m", baseUrl: "", apiKey: "k" })).rejects.toThrow("forbidden");
    }
    await expect(setAiConfig(await ctxFor(org.id, "ADMIN"), { provider: "anthropic", model: "m", baseUrl: "", apiKey: "k" })).resolves.toBeUndefined();
  });

  it("never reuses a stored key for a different provider or URL", async () => {
    const org = await makeOrg();
    const owner = await ctxFor(org.id, "OWNER");
    await setAiConfig(owner, { provider: "anthropic", model: "claude-sonnet-5-5", baseUrl: "", apiKey: "sk-ant-SECRET" });
    // Same destination: the stored key may be kept.
    await setAiConfig(owner, { provider: "anthropic", model: "claude-opus-5-5", baseUrl: "", apiKey: "" });
    expect((await getAiStatus(owner.orgId)).model).toBe("claude-opus-5-5");
    // New destination without a new key: refused.
    await expect(setAiConfig(owner, { provider: "openai", model: "gpt-x", baseUrl: "", apiKey: "" })).rejects.toThrow("ai_key_required_for_destination");
    // New keyless self-hosted destination: the old key is deleted rather than sent there.
    setEnv({ AI_BYOK_ALLOW_PRIVATE_URLS: "true" });
    await setAiConfig(owner, { provider: "openai", model: "llama3", baseUrl: "http://localhost:11434/v1", apiKey: "" });
    expect(await prisma.orgSecret.count({ where: { organizationId: org.id, name: AI_SECRET_NAME } })).toBe(0);
    expect(await getAiProvider(org.id)).toMatchObject({ name: "openai", model: "llama3" });
  });

  it("rejects internal base URLs unless the operator allows them", async () => {
    const org = await makeOrg();
    const owner = await ctxFor(org.id, "OWNER");
    const cfg = { provider: "openai" as const, model: "m", apiKey: "k" };
    await expect(setAiConfig(owner, { ...cfg, baseUrl: "http://169.254.169.254/latest" })).rejects.toThrow("ai_base_url_https_required");
    await expect(setAiConfig(owner, { ...cfg, baseUrl: "https://127.0.0.1:5432/v1" })).rejects.toThrow("ai_base_url_private");
    await expect(setAiConfig(owner, { ...cfg, baseUrl: "https://localhost/v1" })).rejects.toThrow("ai_base_url_private");
    expect(await prisma.orgSecret.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("re-checks the stored URL at use time, so a later policy change takes effect", async () => {
    const org = await makeOrg();
    const owner = await ctxFor(org.id, "OWNER");
    setEnv({ AI_BYOK_ALLOW_PRIVATE_URLS: "true" });
    await setAiConfig(owner, { provider: "openai", model: "llama3", baseUrl: "http://localhost:11434/v1", apiKey: "" });
    setEnv({ AI_BYOK_ALLOW_PRIVATE_URLS: "false" });
    await expect(getAiProvider(org.id)).rejects.toThrow("ai_base_url_https_required");
  });

  it("is isolated per organization, removable, and can be turned off by the server", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const ownerA = await ctxFor(a.id, "OWNER");
    await setAiConfig(ownerA, { provider: "anthropic", model: "claude-sonnet-5-5", baseUrl: "", apiKey: "sk-a" });
    expect((await getAiStatus(b.id)).configured).toBe(false);

    setEnv({ AI_BYOK_ENABLED: "false" });
    expect((await getAiStatus(a.id)).configured).toBe(false);
    await expect(getAiProvider(a.id)).rejects.toThrow("ai_not_configured");
    await expect(setAiConfig(ownerA, { provider: "anthropic", model: "x", baseUrl: "", apiKey: "k" })).rejects.toThrow("byok_disabled");

    setEnv({ AI_BYOK_ENABLED: undefined });
    await removeAiConfig(ownerA);
    expect(await getAiStatus(a.id)).toMatchObject({ configured: false, source: "none" });
  });
});
