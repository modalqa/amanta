import "server-only";
import { z } from "zod";
import { prisma } from "../db/client";
import { ensure, requireUserId, type Ctx } from "../context";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { encryptSecret, randomToken, sha256Hex } from "../crypto";
import { AI_SECRET_NAME } from "../ai";
import type { Permission } from "../auth/permissions";

export const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(200).nullable()),
  nib: z.preprocess((v) => (v === "" ? null : v), z.string().trim().regex(/^[0-9]{13}$/, "nib_13_digits").nullable()),
  address: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable()),
  province: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(80).nullable()),
  timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
  locale: z.enum(["id", "en"]),
  dateFormat: z.enum(["dd/MM/yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "d MMM yyyy"]),
  temperatureUnit: z.enum(["C", "F"]),
  weightUnit: z.enum(["kg", "g", "ton", "lb"]),
});

export async function updateOrgSettings(ctx: Ctx, input: z.infer<typeof orgSettingsSchema>) {
  ensure(ctx, "org:manage");
  const d = orgSettingsSchema.parse(input);
  const org = await prisma.organization.update({ where: { id: ctx.orgId }, data: d });
  await writeAudit(ctx.orgId, ctx.actor, { action: "organization.settings_updated", entityType: "Organization", entityId: ctx.orgId, metadata: d });
  return org;
}

export async function getOrganization(ctx: Ctx) {
  return prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
}

export async function setAiKey(ctx: Ctx, apiKey: string | null) {
  ensure(ctx, "ai:configure");
  if (apiKey === null || apiKey.trim() === "") {
    await ctx.db.orgSecret.deleteMany({ where: { name: AI_SECRET_NAME } });
    await writeAudit(ctx.orgId, ctx.actor, { action: "ai.key_removed", entityType: "OrgSecret" });
    return;
  }
  if (apiKey.length > 500) throw new AppError("VALIDATION", "key_too_long");
  const enc = encryptSecret(apiKey.trim(), `${ctx.orgId}:${AI_SECRET_NAME}`);
  await ctx.db.orgSecret.upsert({
    where: { organizationId_name: { organizationId: ctx.orgId, name: AI_SECRET_NAME } },
    create: { organizationId: ctx.orgId, name: AI_SECRET_NAME, ...enc },
    update: enc,
  });
  // Never log the key; only its fingerprint suffix.
  await writeAudit(ctx.orgId, ctx.actor, { action: "ai.key_set", entityType: "OrgSecret", metadata: { fingerprint: sha256Hex(apiKey).slice(0, 8) } });
}

export const API_SCOPES: Permission[] = ["traceability:read", "traceability:write", "ccp:read", "ccp:record", "deviations:read", "deviations:create", "suppliers:read", "haccp:read", "checklists:read"];

export const apiKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(API_SCOPES as [Permission, ...Permission[]])).min(1),
  expiresInDays: z.coerce.number().int().min(1).max(730).default(365),
});

/** Creates an API key. The full secret is returned ONCE; only its SHA-256 hash is stored. */
export async function createApiKey(ctx: Ctx, input: z.infer<typeof apiKeySchema>) {
  ensure(ctx, "apikeys:manage");
  const d = apiKeySchema.parse(input);
  const prefix = randomToken(6).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase().padEnd(8, "0");
  const secret = randomToken(32);
  const key = `amk_${prefix}_${secret}`;
  const row = await ctx.db.apiKey.create({ data: { organizationId: ctx.orgId, name: d.name, prefix, keyHash: sha256Hex(key), scopes: d.scopes, createdById: requireUserId(ctx), expiresAt: new Date(Date.now() + d.expiresInDays * 86400000) } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "apikey.created", entityType: "ApiKey", entityId: row.id, summary: d.name, metadata: { scopes: d.scopes, prefix } });
  return { row, key };
}

export async function listApiKeys(ctx: Ctx) {
  ensure(ctx, "apikeys:manage");
  return ctx.db.apiKey.findMany({ select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } });
}

export async function revokeApiKey(ctx: Ctx, id: string) {
  ensure(ctx, "apikeys:manage");
  const k = await ctx.db.apiKey.findUnique({ where: { id } });
  if (!k) throw new AppError("NOT_FOUND", "apikey_not_found");
  await ctx.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "apikey.revoked", entityType: "ApiKey", entityId: id });
}

export async function listNotifications(ctx: Ctx, onlyUnread = false) {
  return ctx.db.notification.findMany({ where: { OR: [{ userId: null }, { userId: ctx.userId ?? "__none__" }], ...(onlyUnread ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
}

export async function markNotificationsRead(ctx: Ctx, ids?: string[]) {
  await ctx.db.notification.updateMany({ where: { readAt: null, OR: [{ userId: null }, { userId: ctx.userId ?? "__none__" }], ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
