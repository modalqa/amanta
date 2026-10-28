import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../db/client";
import { tenantDb } from "../db/tenant";
import { randomToken, sha256Hex } from "../crypto";
import { env } from "../env";
import { permissionsForRole, type Ctx } from "../context";
import type { Permission } from "./permissions";

export const SESSION_COOKIE = "amanta_session";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export async function clientMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return { ip, userAgent: (h.get("user-agent") ?? "").slice(0, 300) };
}

export async function createSession(userId: string, organizationId: string | null) {
  const token = randomToken(32);
  const meta = await clientMeta();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { tokenHash: sha256Hex(token), userId, organizationId, ipAddress: meta.ip, userAgent: meta.userAgent, expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: env().COOKIE_SECURE === "true", path: "/", expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Loads the session for the current request (memoized per request). */
export const getSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return session;
});

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Builds the tenant context for the session's active organization. */
export const getOrgContext = cache(async (): Promise<Ctx | null> => {
  const s = await getSession();
  if (!s || !s.organizationId) return null;
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: s.organizationId, userId: s.userId } },
    include: { organization: true },
  });
  if (!membership || !membership.active) return null;
  const o = membership.organization;
  const meta = await clientMeta();
  return {
    orgId: o.id,
    org: { id: o.id, name: o.name, slug: o.slug, timezone: o.timezone, locale: o.locale, dateFormat: o.dateFormat, temperatureUnit: o.temperatureUnit, weightUnit: o.weightUnit },
    userId: s.userId,
    userName: s.user.name,
    role: membership.role,
    permissions: permissionsForRole(membership.role),
    db: tenantDb(o.id),
    actor: { userId: s.userId, ip: meta.ip },
  };
});

/** For pages and server actions: redirects when not signed in or no organization selected. */
export async function requireCtx(perm?: Permission): Promise<Ctx> {
  const s = await requireUser();
  const ctx = await getOrgContext();
  if (!ctx) redirect(s.organizationId ? "/login" : "/select-org");
  // Pages: a missing permission sends the user to the dashboard with a friendly message
  // (server actions still throw via ensure() inside the services).
  if (perm && !ctx.permissions.has(perm)) redirect("/app?error=forbidden");
  return ctx;
}

export async function switchOrganization(organizationId: string) {
  const s = await requireUser();
  const m = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: s.userId } } });
  if (!m || !m.active) return false;
  // Rotate the session on context switch.
  await prisma.session.delete({ where: { id: s.id } });
  await createSession(s.userId, organizationId);
  return true;
}
