import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/** Atomically increments an organization counter and returns a code like DEV-2026-0007. */
export async function nextCode(tx: Prisma.TransactionClient, orgId: string, prefix: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const name = `${prefix}-${year}`;
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "Counter" ("organizationId", "name", "value") VALUES (${orgId}, ${name}, 1)
    ON CONFLICT ("organizationId", "name") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${name}-${String(rows[0].value).padStart(4, "0")}`;
}
