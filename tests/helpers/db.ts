import { prisma } from "@/server/db/client";
import { tenantDb } from "@/server/db/tenant";
import { permissionsForRole, type Ctx } from "@/server/context";
import type { Role } from "@/generated/prisma/enums";
import { randomBytes } from "node:crypto";

export async function resetDb() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export async function makeOrg(name = "Org " + randomBytes(3).toString("hex")) {
  return prisma.organization.create({ data: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + randomBytes(3).toString("hex") } });
}

export async function makeUser(orgId: string, role: Role, name = role.toLowerCase()) {
  const user = await prisma.user.create({ data: { email: `${name}-${randomBytes(4).toString("hex")}@example.test`, name, passwordHash: "x" } });
  await prisma.membership.create({ data: { organizationId: orgId, userId: user.id, role } });
  return user;
}

export async function ctxFor(orgId: string, role: Role, userId?: string): Promise<Ctx> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const uid = userId ?? (await makeUser(orgId, role)).id;
  return {
    orgId, org: { id: org.id, name: org.name, slug: org.slug, timezone: org.timezone, locale: org.locale, dateFormat: org.dateFormat, temperatureUnit: org.temperatureUnit, weightUnit: org.weightUnit },
    userId: uid, userName: role, role, permissions: permissionsForRole(role), db: tenantDb(orgId), actor: { userId: uid, ip: "test" },
  };
}
