import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import pg from "pg";

/** Resets the E2E database, applies migrations and seeds demo data. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://amanta:amanta_dev@localhost:5432/amanta_e2e";
  if (!/e2e|test/.test(url)) throw new Error("Refusing to reset a non-E2E database");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS pgboss CASCADE;");
  await c.end();
  rmSync("./storage-e2e", { recursive: true, force: true });
  const env = { ...process.env, DATABASE_URL: url, APP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"), NODE_ENV: "development" as const };
  execSync("node scripts/db-migrate.mjs", { env, stdio: "inherit" });
  execSync("npx tsx --conditions=react-server prisma/seed.ts", { env, stdio: "inherit" });
}
