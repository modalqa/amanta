import "server-only";
import { z } from "zod";
import { prisma } from "../db/client";
import { AppError } from "../errors";
import { hashPassword, passwordPolicyError, verifyPassword } from "../auth/password";
import { rateLimit } from "../ratelimit";
import { writeAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { assignableRoles } from "../auth/permissions";
import { ensure, requireUserId, type Ctx } from "../context";
import type { Role } from "@/generated/prisma/enums";

const MAX_FAILED = 5;
let dummyHash: Promise<string> | undefined;
const LOCK_MINUTES = 15;

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
  organizationName: z.string().trim().min(2).max(120),
});

export function slugify(input: string): string {
  return input.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    if (!(await prisma.organization.findUnique({ where: { slug: candidate } }))) return candidate;
  }
  slug = `${slug}-${Date.now()}`;
  return slug;
}

/** Creates a user, a new organization and an OWNER membership. */
export async function registerAccount(input: z.infer<typeof registerSchema>, ip: string) {
  await rateLimit(`register:${ip}`, 5, 3600);
  const data = registerSchema.parse(input);
  const policy = passwordPolicyError(data.password);
  if (policy) throw new AppError("VALIDATION", policy);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError("CONFLICT", "email_taken");
  const passwordHash = await hashPassword(data.password);
  const slug = await uniqueSlug(data.organizationName);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: data.email, name: data.name, passwordHash } });
    const org = await tx.organization.create({ data: { name: data.organizationName, slug } });
    await tx.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
    await writeAudit(org.id, { userId: user.id, ip }, { action: "organization.created", entityType: "Organization", entityId: org.id, summary: `Organization ${org.name} created` }, tx);
    return { user, org };
  });
}

/** Verifies credentials with lockout and rate limiting. Returns the user and their default org. */
export async function authenticate(emailRaw: string, password: string, ip: string) {
  const email = emailRaw.trim().toLowerCase();
  await rateLimit(`login-ip:${ip}`, 30, 900);
  await rateLimit(`login-email:${email}`, 10, 900);
  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: { where: { active: true }, orderBy: { createdAt: "asc" } } } });
  if (!user) {
    // Equalize timing with a real argon2 verification against a dummy hash.
    dummyHash ??= hashPassword(randomToken(16));
    await verifyPassword(await dummyHash, password);
    throw new AppError("UNAUTHENTICATED", "invalid_credentials");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError("ACCOUNT_LOCKED", "account_locked");
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLoginCount: failed },
    });
    throw new AppError("UNAUTHENTICATED", "invalid_credentials");
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const defaultOrgId = user.memberships.length === 1 ? user.memberships[0].organizationId : null;
  return { user, defaultOrgId, membershipCount: user.memberships.length };
}

export async function listUserOrganizations(userId: string) {
  return prisma.membership.findMany({ where: { userId, active: true }, include: { organization: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: "asc" } });
}

// ───── Members & invitations ─────

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["OWNER", "ADMIN", "QA_MANAGER", "SUPERVISOR", "OPERATOR", "AUDITOR"]),
});

/** Creates an invitation and returns the one-time token (shown to the inviter as a link). */
export async function inviteMember(ctx: Ctx, input: z.infer<typeof inviteSchema>) {
  ensure(ctx, "members:manage");
  const data = inviteSchema.parse(input);
  if (!assignableRoles(ctx.role!).includes(data.role as Role)) throw new AppError("FORBIDDEN", "cannot_assign_role");
  const token = randomToken(32);
  const inv = await ctx.db.invitation.create({
    data: { organizationId: ctx.orgId, email: data.email, role: data.role, tokenHash: sha256Hex(token), invitedById: requireUserId(ctx), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
  });
  await writeAudit(ctx.orgId, ctx.actor, { action: "member.invited", entityType: "Invitation", entityId: inv.id, summary: `Invited ${data.email} as ${data.role}` });
  return { invitation: inv, token };
}

export const acceptInviteSchema = z.object({
  token: z.string().min(10).max(100),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(1).max(200),
});

/** Accepts an invitation: creates the user if needed (password required) or links an existing account (password verified). */
export async function acceptInvitation(input: z.infer<typeof acceptInviteSchema>, ip: string) {
  await rateLimit(`invite:${ip}`, 20, 3600);
  const data = acceptInviteSchema.parse(input);
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(data.token) } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new AppError("NOT_FOUND", "invitation_invalid");
  let user = await prisma.user.findUnique({ where: { email: inv.email } });
  if (user) {
    if (!(await verifyPassword(user.passwordHash, data.password))) throw new AppError("UNAUTHENTICATED", "invalid_credentials");
  } else {
    const policy = passwordPolicyError(data.password);
    if (policy) throw new AppError("VALIDATION", policy);
    user = await prisma.user.create({ data: { email: inv.email, name: data.name, passwordHash: await hashPassword(data.password) } });
  }
  const u = user;
  await prisma.$transaction(async (tx) => {
    await tx.membership.upsert({
      where: { organizationId_userId: { organizationId: inv.organizationId, userId: u.id } },
      create: { organizationId: inv.organizationId, userId: u.id, role: inv.role },
      update: { role: inv.role, active: true },
    });
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await writeAudit(inv.organizationId, { userId: u.id, ip }, { action: "member.joined", entityType: "Membership", entityId: u.id, summary: `${u.email} joined as ${inv.role}` }, tx);
  });
  return { user: u, organizationId: inv.organizationId };
}

export async function listMembers(ctx: Ctx) {
  return ctx.db.membership.findMany({ include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } }, orderBy: { createdAt: "asc" } });
}

export async function listAssignableUsers(ctx: Ctx) {
  const ms = await ctx.db.membership.findMany({ where: { active: true, role: { not: "AUDITOR" } }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } });
  return ms.map((m) => ({ id: m.user.id, name: m.user.name, role: m.role }));
}

export async function updateMember(ctx: Ctx, membershipId: string, patch: { role?: Role; active?: boolean }) {
  ensure(ctx, "members:manage");
  const m = await ctx.db.membership.findUnique({ where: { id: membershipId } });
  if (!m) throw new AppError("NOT_FOUND", "member_not_found");
  if (m.userId === ctx.userId) throw new AppError("INVALID_STATE", "cannot_modify_self");
  if (m.role === "OWNER" && ctx.role !== "OWNER") throw new AppError("FORBIDDEN", "cannot_modify_owner");
  if (patch.role && !assignableRoles(ctx.role!).includes(patch.role)) throw new AppError("FORBIDDEN", "cannot_assign_role");
  if ((patch.active === false || (patch.role && patch.role !== "OWNER")) && m.role === "OWNER") {
    const owners = await ctx.db.membership.count({ where: { role: "OWNER", active: true } });
    if (owners <= 1) throw new AppError("INVALID_STATE", "last_owner");
  }
  const updated = await ctx.db.membership.update({ where: { id: membershipId }, data: patch });
  if (patch.active === false) await prisma.session.deleteMany({ where: { userId: m.userId, organizationId: ctx.orgId } });
  await writeAudit(ctx.orgId, ctx.actor, { action: "member.updated", entityType: "Membership", entityId: membershipId, metadata: patch });
  return updated;
}
