import type { Role } from "@/generated/prisma/enums";

const ALL: Role[] = ["OWNER", "ADMIN", "QA_MANAGER", "SUPERVISOR", "OPERATOR", "AUDITOR"];
const MGMT: Role[] = ["OWNER", "ADMIN"];
const QA: Role[] = ["OWNER", "ADMIN", "QA_MANAGER"];
const LEADS: Role[] = ["OWNER", "ADMIN", "QA_MANAGER", "SUPERVISOR"];
const DOERS: Role[] = ["OWNER", "ADMIN", "QA_MANAGER", "SUPERVISOR", "OPERATOR"];

export const PERMISSIONS = {
  "org:manage": MGMT,
  "members:manage": MGMT,
  "apikeys:manage": MGMT,
  "ai:configure": MGMT,
  "documents:read": ALL,
  "documents:write": LEADS,
  "ai:run": QA,
  "haccp:read": ALL,
  "haccp:write": QA,
  "haccp:approve": QA,
  "checklists:read": ALL,
  "checklists:manage": QA,
  "checklists:submit": DOERS,
  "ccp:read": ALL,
  "ccp:record": DOERS,
  "deviations:read": ALL,
  "deviations:create": DOERS,
  "deviations:manage": LEADS,
  "deviations:close": QA,
  "capa:read": ALL,
  "capa:manage": QA,
  "capa:work": DOERS,
  "capa:verify": QA,
  "suppliers:read": ALL,
  "suppliers:write": QA,
  "traceability:read": ALL,
  "traceability:write": LEADS,
  "reports:read": ALL,
  "audit:read": ["OWNER", "ADMIN", "QA_MANAGER", "AUDITOR"],
} as const satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function roleHas(role: Role, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly Role[]).includes(role);
}

export const ROLES = ALL;
/** Roles an actor may assign. Only OWNER can create other OWNERs. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "OWNER") return ALL;
  if (actor === "ADMIN") return ALL.filter((r) => r !== "OWNER");
  return [];
}
