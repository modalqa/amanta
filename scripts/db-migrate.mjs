#!/usr/bin/env node
// Fallback migration runner, compatible with Prisma Migrate's `_prisma_migrations` table.
// Prefer `npx prisma migrate deploy`. Use this only where Prisma's schema-engine binary
// cannot be downloaded (air-gapped builds). Migrations applied here are recognised by
// `prisma migrate deploy` afterwards because the checksum format is identical (sha256 hex).
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const dir = new URL("../prisma/migrations/", import.meta.url).pathname;
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
  const applied = new Map((await client.query(`SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows.map((r) => [r.migration_name, r.checksum]));
  const names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const name of names) {
    const file = join(dir, name, "migration.sql");
    if (!existsSync(file)) continue;
    const sql = readFileSync(file, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (applied.has(name)) {
      if (applied.get(name) !== checksum) throw new Error(`Migration ${name} was modified after being applied`);
      continue;
    }
    const id = randomUUID();
    await client.query("BEGIN");
    try {
      await client.query(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ($1,$2,$3,now())`, [id, checksum, name]);
      await client.query(sql);
      await client.query(`UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`, [id]);
      await client.query("COMMIT");
      console.log(`applied ${name}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${name} failed: ${e.message}`);
    }
  }
  console.log("database is up to date");
} finally {
  await client.end();
}
