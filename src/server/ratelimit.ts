import "server-only";
import { prisma } from "./db/client";
import { AppError } from "./errors";

/**
 * Fixed-window rate limiter stored in PostgreSQL (works across instances).
 * Throws RATE_LIMITED when `limit` is exceeded within `windowSec`.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSec * 1000)) * windowSec * 1000);
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  if (count > limit) {
    throw new AppError("RATE_LIMITED", "Too many requests, please try again later");
  }
  // Opportunistic cleanup of old windows (1% of calls).
  if (Math.random() < 0.01) {
    await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now - 24 * 3600 * 1000) } } });
  }
}
