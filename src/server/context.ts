import "server-only";
import type { Role } from "@/generated/prisma/enums";
import type { TenantDb } from "./db/tenant";
import type { AuditActor } from "./audit";
import { AppError } from "./errors";
import { PERMISSIONS, type Permission } from "./auth/permissions";

export type OrgSettings = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: "id" | "en";
  dateFormat: string;
  temperatureUnit: "C" | "F";
  weightUnit: string;
};

/** Authenticated, tenant-bound request context passed to every service function. */
export type Ctx = {
  orgId: string;
  org: OrgSettings;
  userId: string | null; // null for API-key requests
  userName: string;
  role: Role | null;
  permissions: ReadonlySet<Permission>;
  db: TenantDb;
  actor: AuditActor;
};

export function permissionsForRole(role: Role): Set<Permission> {
  return new Set((Object.keys(PERMISSIONS) as Permission[]).filter((p) => (PERMISSIONS[p] as readonly Role[]).includes(role)));
}

export function can(ctx: Pick<Ctx, "permissions">, perm: Permission): boolean {
  return ctx.permissions.has(perm);
}

export function ensure(ctx: Pick<Ctx, "permissions">, perm: Permission): void {
  if (!ctx.permissions.has(perm)) throw new AppError("FORBIDDEN", "forbidden", { permission: perm });
}

export function requireUserId(ctx: Ctx): string {
  if (!ctx.userId) throw new AppError("FORBIDDEN", "This action requires a user session");
  return ctx.userId;
}
