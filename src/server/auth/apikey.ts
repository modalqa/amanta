import "server-only";
import { prisma } from "../db/client";
import { tenantDb } from "../db/tenant";
import { safeEqual, sha256Hex } from "../crypto";
import { AppError } from "../errors";
import { rateLimit } from "../ratelimit";
import type { Ctx } from "../context";
import type { Permission } from "./permissions";

const KEY_RE = /^amk_([a-z0-9]{8})_([A-Za-z0-9_-]{20,100})$/;

/** Authenticates `Authorization: Bearer amk_<prefix>_<secret>` and returns a scoped context. */
export async function authenticateApiKey(authorization: string | null, ip: string): Promise<Ctx> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  const m = token ? KEY_RE.exec(token) : null;
  if (!token || !m) throw new AppError("UNAUTHENTICATED", "invalid_api_key");
  await rateLimit(`api-ip:${ip}`, 600, 60);
  const key = await prisma.apiKey.findUnique({ where: { prefix: m[1] }, include: { organization: true } });
  if (!key || !safeEqual(key.keyHash, sha256Hex(token)) || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) {
    throw new AppError("UNAUTHENTICATED", "invalid_api_key");
  }
  await rateLimit(`api-key:${key.id}`, 300, 60);
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  const o = key.organization;
  return {
    orgId: o.id,
    org: { id: o.id, name: o.name, slug: o.slug, timezone: o.timezone, locale: o.locale, dateFormat: o.dateFormat, temperatureUnit: o.temperatureUnit, weightUnit: o.weightUnit },
    userId: null,
    userName: `API: ${key.name}`,
    role: null,
    permissions: new Set(key.scopes as Permission[]),
    db: tenantDb(o.id),
    actor: { apiKeyId: key.id, ip },
  };
}
