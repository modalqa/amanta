import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __amantaPrisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

/** Unscoped client. Only use for global tables (User, Session, Organization, RateLimit) and inside tenantDb. */
export const prisma: PrismaClient = globalForPrisma.__amantaPrisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.__amantaPrisma = prisma;
