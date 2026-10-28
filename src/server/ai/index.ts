import "server-only";
import { prisma } from "../db/client";
import { env } from "../env";
import { AppError } from "../errors";
import { decryptSecret } from "../crypto";
import { AnthropicProvider, OpenAiCompatibleProvider } from "./providers";
import type { AiProvider } from "./types";

export const AI_SECRET_NAME = "ai_api_key";

export type AiStatus = { configured: boolean; provider: string; model: string | null; source: "organization" | "environment" | "none" };

let testOverride: AiProvider | null | undefined;
/** Tests only: inject a provider. Throws outside NODE_ENV=test. */
export function setAiProviderForTesting(p: AiProvider | null | undefined) {
  if (process.env.NODE_ENV !== "test") throw new Error("setAiProviderForTesting is test-only");
  testOverride = p;
}

async function orgKey(orgId: string): Promise<string | null> {
  const s = await prisma.orgSecret.findUnique({ where: { organizationId_name: { organizationId: orgId, name: AI_SECRET_NAME } } });
  if (!s) return null;
  return decryptSecret(s, `${orgId}:${AI_SECRET_NAME}`);
}

/** Resolves the provider for an organization: org-level encrypted key overrides the env key. */
export async function getAiProvider(orgId: string): Promise<AiProvider> {
  if (testOverride !== undefined) {
    if (testOverride === null) throw new AppError("AI_NOT_CONFIGURED", "ai_not_configured");
    return testOverride;
  }
  const e = env();
  if (e.AI_PROVIDER === "none") throw new AppError("AI_NOT_CONFIGURED", "ai_not_configured");
  const override = await orgKey(orgId);
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
  if (e.AI_PROVIDER === "none") return { configured: false, provider: "none", model: null, source: "none" };
  const hasOrg = !!(await prisma.orgSecret.findUnique({ where: { organizationId_name: { organizationId: orgId, name: AI_SECRET_NAME } }, select: { id: true } }));
  const envKey = e.AI_PROVIDER === "anthropic" ? e.ANTHROPIC_API_KEY : e.OPENAI_API_KEY || (!e.OPENAI_BASE_URL.startsWith("https://api.openai.com") ? "local" : "");
  const model = e.AI_PROVIDER === "anthropic" ? e.ANTHROPIC_MODEL : e.OPENAI_MODEL;
  return { configured: hasOrg || !!envKey, provider: e.AI_PROVIDER, model, source: hasOrg ? "organization" : envKey ? "environment" : "none" };
}
