import "server-only";
import { PgBoss } from "pg-boss";

export const QUEUES = {
  extractDocument: "document-extract",
  aiHaccp: "ai-haccp-from-document",
  aiChecklist: "ai-checklist-from-document",
  aiCapa: "ai-capa-draft",
  dailyAlerts: "daily-alerts",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const g = globalThis as unknown as { __amantaBoss?: Promise<PgBoss> };

/** Producer-side pg-boss instance (no supervision/scheduling; the worker does maintenance). */
export function boss(): Promise<PgBoss> {
  if (!g.__amantaBoss) {
    g.__amantaBoss = (async () => {
      const b = new PgBoss({ connectionString: process.env.DATABASE_URL!, supervise: false, schedule: false, migrate: true });
      b.on("error", (e) => console.error("[pg-boss]", e.message));
      await b.start();
      for (const q of Object.values(QUEUES)) await b.createQueue(q);
      return b;
    })().catch((e) => { g.__amantaBoss = undefined; throw e; });
  }
  return g.__amantaBoss;
}

type Inline = (queue: QueueName, data: Record<string, unknown>) => Promise<void>;
let inlineRunner: Inline | undefined;
/** Tests: execute jobs synchronously instead of enqueueing. */
export function setInlineJobRunner(fn: Inline | undefined) { inlineRunner = fn; }

export async function enqueue(queue: QueueName, data: Record<string, unknown>, opts: { singletonKey?: string } = {}) {
  if (inlineRunner) { await inlineRunner(queue, data); return null; }
  const b = await boss();
  return b.send(queue, data, { retryLimit: queue === QUEUES.extractDocument ? 2 : 1, retryDelay: 10, retryBackoff: true, expireInSeconds: 600, ...(opts.singletonKey ? { singletonKey: opts.singletonKey } : {}) });
}
