/**
 * Background worker: document extraction, AI generation and daily alerts (pg-boss).
 * Run: `npm run worker` (uses the react-server condition so server-only modules load).
 */
import "dotenv/config";
import { PgBoss } from "pg-boss";
import { QUEUES } from "../server/jobs/queue";
import { HANDLERS } from "../server/jobs/handlers";
import { env } from "../server/env";

async function main() {
  const e = env();
  const boss = new PgBoss({ connectionString: e.DATABASE_URL, schedule: true, supervise: true, migrate: true });
  boss.on("error", (err) => console.error("[worker] pg-boss error:", err.message));
  await boss.start();
  for (const q of Object.values(QUEUES)) await boss.createQueue(q);

  const concurrency: Record<string, number> = { [QUEUES.extractDocument]: 2, [QUEUES.aiHaccp]: 1, [QUEUES.aiChecklist]: 1, [QUEUES.aiCapa]: 2, [QUEUES.dailyAlerts]: 1 };
  for (const [queue, handler] of Object.entries(HANDLERS)) {
    for (let i = 0; i < (concurrency[queue] ?? 1); i++) {
      await boss.work(queue, { pollingIntervalSeconds: 1, batchSize: 1 }, async (jobs) => {
        for (const job of jobs) {
          const started = Date.now();
          try {
            await (handler as (d: unknown) => Promise<unknown>)(job.data);
            console.log(JSON.stringify({ level: "info", msg: "job.done", queue, id: job.id, ms: Date.now() - started }));
          } catch (err) {
            console.error(JSON.stringify({ level: "error", msg: "job.failed", queue, id: job.id, error: (err as Error).message }));
            throw err;
          }
        }
      });
    }
  }
  await boss.schedule(QUEUES.dailyAlerts, e.ALERTS_CRON, {});
  console.log(JSON.stringify({ level: "info", msg: "worker.started", queues: Object.values(QUEUES), aiProvider: e.AI_PROVIDER, storage: e.STORAGE_DRIVER }));

  const shutdown = async () => { console.log("worker stopping"); await boss.stop({ graceful: true, timeout: 30000 }); process.exit(0); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });
