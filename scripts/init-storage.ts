/** Ensures the S3 bucket exists (idempotent). Run after migrations in container deployments. */
import "dotenv/config";
import { env } from "../src/server/env";
import { S3Storage } from "../src/server/storage";

async function main() {
  const e = env();
  if (e.STORAGE_DRIVER !== "s3") { console.log("STORAGE_DRIVER is not s3 – nothing to do"); return; }
  const s = new S3Storage(e.S3_BUCKET, e.S3_SSE || undefined);
  for (let i = 1; i <= 10; i++) {
    try { await s.ensureBucket(); console.log(`bucket ${e.S3_BUCKET} ready`); return; }
    catch (err) { console.log(`waiting for S3 (${i}/10): ${(err as Error).message}`); await new Promise((r) => setTimeout(r, 3000)); }
  }
  throw new Error("S3 not reachable");
}
main().catch((e) => { console.error(e); process.exit(1); });
