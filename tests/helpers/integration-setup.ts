import { beforeAll } from "vitest";

// Integration tests run against a real PostgreSQL database (TEST_DATABASE_URL), never the dev DB.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://amanta:amanta_dev@localhost:5432/amanta_test";
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = process.env.TEST_STORAGE_DIR ?? "./storage-test";
process.env.AI_PROVIDER ??= "none";
(process.env as Record<string, string>).NODE_ENV = "test";

beforeAll(async () => {
  if (!/_test\b|test/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to run integration tests against a non-test database");
});
