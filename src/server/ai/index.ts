import "server-only";
import { z } from "zod";
import { prisma } from "../db/client";
import { env } from "../env";
import { AppError } from "../errors";
import { decryptSecret } from "../crypto";
import { AnthropicProvider, OpenAiCompatibleProvider } from "./providers";
import { assertSafeAiBaseUrl } from "./url-guard";
import type { AiProvider } from "./types";

export const AI_SECRET_NAME = "ai_api_key";
/** BYOK provider settings (provider, model, base URL). Stored encrypted like the key: a base URL can reveal internal gateways. */
export const AI_CONFIG_NAME = "ai_config";

export const aiConfigShape = z.object({
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().trim().min(1).max(120).regex(/^[\w.:/@+-]+$/, "invalid_model"),
  baseUrl: z.string().trim().max(300).nullable(),
  keyHint: z.string().max(8).nullable(),
});
export type AiConfig = z.infer<typeof aiConfigShape>;

export type AiStatus = {
  configured: boolean;
  provider: string;
  model: string | null;
  baseUrl: string | null;
  keyHint: string | null;
  source: "organization" | "environment" | "none";
  byokEnabled: boolean;
};

let testOverride: AiProvider | null | undefined;
/** Tests only: inject a provider. Throws outside NODE_ENV=test. */
export function setAiProviderForTesting(p: AiProvider | null | undefined) {
  if (process.env.NODE_ENV !== "test") throw new Error("setAiProviderForTesting is test-only");
  testOverride = p;
}

async function orgSecret(orgId: string, name: string): Promise<string | null> {
  const s = await prisma.orgSecret.findUnique({ where: { organizationId_name: { organizationId: orgId, name } } });
  if (!s) return null;
  return decryptSecret(s, `${orgId}:${name}`);
}

export async function getOrgAiConfig(orgId: string): Promise<AiConfig | null> {
  const raw = await orgSecret(orgId, AI_CONFIG_NAME);
  if (!raw) return null;
  const parsed = aiConfigShape.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

/** Builds a provider from an organization's own settings (BYOK). The base URL is re-checked on every use. */
export async function providerFromOrgConfig(cfg: AiConfig, key: string | null): Promise<AiProvider> {
  const e = env();
  if (cfg.provider === "anthropic") {
    if (!key) throw new AppError("AI_NOT_CONFIGURED", "ai_key_missing");
    return new AnthropicProvider(key, cfg.model, e.AI_TIMEOUT_MS);
  }
  const baseUrl = cfg.baseUrl ?? "https://api.openai.com/v1";
  await assertSafeAiBaseUrl(baseUrl, e.AI_BYOK_ALLOW_PRIVATE_URLS === "true");
  if (!key && baseUrl.startsWith("https://api.openai.com")) throw new AppError("AI_NOT_CONFIGURED", "ai_key_missing");
  return new OpenAiCompatibleProvider(key ?? "", cfg.model, baseUrl, e.AI_TIMEOUT_MS);
}

/**
 * Resolves the provider for an organization:
 * 1. the organization's own provider + key (BYOK), when enabled on this server;
 * 2. otherwise the server provider, with the organization's key overriding the server key.
 */
export async function getAiProvider(orgId: string): Promise<AiProvider> {
  if (testOverride !== undefined) {
    if (testOverride === null) throw new AppError("AI_NOT_CONFIGURED", "ai_not_configured");
    return testOverride;
  }
  const e = env();
  const override = await orgSecret(orgId, AI_SECRET_NAME);
  if (e.AI_BYOK_ENABLED === "true") {
    const cfg = await getOrgAiConfig(orgId);
    if (cfg) return providerFromOrgConfig(cfg, override);
  }
  if (e.AI_PROVIDER === "none") throw new AppError("AI_NOT_CONFIGURED", "ai_not_configured");
  if (e.AI_PROVIDER === "anthropic") {
    const key = override ?? e.ANTHROPIC_API_KEY;
    if (!key) throw new AppError("AI_NOT_CONFIGURED", "ai_key_missing");
    return new AnthropicProvider(key, e.ANTHROPIC_MODEL, e.AI_TIMEOUT_MS, e.ANTHROPIC_BASE_URL_OVERRIDE ?? "https://api.anthropic.com");
  }
  const key = override ?? e.OPENAI_API_KEY ?? "";
  if (!key && e.OPENAI_BASE_URL.startsWith("https://api.openai.com")) throw new AppError("AI_NOT_CONFIGURED", "ai_key_missing");
  return new OpenAiCompatibleProvider(key, e.OPENAI_MODEL, e.OPENAI_BASE_URL, e.AI_TIMEOUT_MS);
}

export async function getAiStatus(orgId: string): Promise<AiStatus> {
  const e = env();
  const byokEnabled = e.AI_BYOK_ENABLED === "true";
  const hasOrgKey = !!(await prisma.orgSecret.findUnique({ where: { organizationId_name: { organizationId: orgId, name: AI_SECRET_NAME } }, select: { id: true } }));
  const cfg = byokEnabled ? await getOrgAiConfig(orgId) : null;
  if (cfg) {
    const keyless = cfg.provider === "openai" && !!cfg.baseUrl && !cfg.baseUrl.startsWith("https://api.openai.com");
    return { configured: hasOrgKey || keyless, provider: cfg.provider, model: cfg.model, baseUrl: cfg.provider === "openai" ? cfg.baseUrl : null, keyHint: cfg.keyHint, source: "organization", byokEnabled };
  }
  if (e.AI_PROVIDER === "none") return { configured: false, provider: "none", model: null, baseUrl: null, keyHint: null, source: "none", byokEnabled };
  const envKey = e.AI_PROVIDER === "anthropic" ? e.ANTHROPIC_API_KEY : e.OPENAI_API_KEY || (!e.OPENAI_BASE_URL.startsWith("https://api.openai.com") ? "local" : "");
  const model = e.AI_PROVIDER === "anthropic" ? e.ANTHROPIC_MODEL : e.OPENAI_MODEL;
  // The server base URL is operator configuration: never shown to tenants.
  return { configured: hasOrgKey || !!envKey, provider: e.AI_PROVIDER, model, baseUrl: null, keyHint: null, source: hasOrgKey ? "organization" : envKey ? "environment" : "none", byokEnabled };
}
