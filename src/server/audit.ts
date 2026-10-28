import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "./db/client";
import type { Prisma } from "@/generated/prisma/client";

export type AuditActor = { userId?: string | null; apiKeyId?: string | null; ip?: string | null };

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown>;
};

type Tx = Prisma.TransactionClient;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export function computeAuditHash(row: {
  organizationId: string; seq: number; actorUserId: string | null; actorApiKeyId: string | null;
  action: string; entityType: string; entityId: string | null; summary: string | null;
  metadata: unknown; createdAt: Date; prevHash: string | null;
}): string {
  const payload = canonical({ ...row, createdAt: row.createdAt.toISOString() });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Appends a hash-chained audit entry. Uses a per-organization advisory lock so the
 * sequence and chain stay consistent under concurrency. Pass `tx` to make the audit
 * write part of the business transaction.
 */
export async function writeAudit(orgId: string, actor: AuditActor, entry: AuditEntry, tx?: Tx): Promise<void> {
  const run = async (client: Tx) => {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"audit:" + orgId}))`;
    const last = await client.auditLog.findFirst({ where: { organizationId: orgId }, orderBy: { seq: "desc" }, select: { seq: true, hash: true } });
    const seq = (last?.seq ?? 0) + 1;
    const createdAt = new Date();
    const metadata = entry.metadata ? (JSON.parse(JSON.stringify(entry.metadata)) as Prisma.InputJsonValue) : undefined;
    const base = {
      organizationId: orgId, seq, actorUserId: actor.userId ?? null, actorApiKeyId: actor.apiKeyId ?? null,
      action: entry.action, entityType: entry.entityType, entityId: entry.entityId ?? null,
      summary: entry.summary ?? null, metadata: metadata ?? null, createdAt, prevHash: last?.hash ?? null,
    };
    await client.auditLog.create({ data: { ...base, metadata, ipAddress: actor.ip ?? null, hash: computeAuditHash(base) } });
  };
  if (tx) await run(tx);
  else await prisma.$transaction((t) => run(t));
}

/** Recomputes the whole chain for an organization. Returns the first broken seq, if any. */
export async function verifyAuditChain(orgId: string): Promise<{ ok: boolean; checked: number; brokenAtSeq?: number }> {
  let prevHash: string | null = null;
  let checked = 0;
  let cursor = 0;
  for (;;) {
    const rows = await prisma.auditLog.findMany({ where: { organizationId: orgId, seq: { gt: cursor } }, orderBy: { seq: "asc" }, take: 1000 });
    if (rows.length === 0) break;
    for (const r of rows) {
      const expected = computeAuditHash({
        organizationId: r.organizationId, seq: r.seq, actorUserId: r.actorUserId, actorApiKeyId: r.actorApiKeyId,
        action: r.action, entityType: r.entityType, entityId: r.entityId, summary: r.summary,
        metadata: r.metadata ?? null, createdAt: r.createdAt, prevHash: r.prevHash,
      });
      if (r.prevHash !== prevHash || r.hash !== expected || r.seq !== checked + 1) return { ok: false, checked, brokenAtSeq: r.seq };
      prevHash = r.hash;
      checked++;
      cursor = r.seq;
    }
  }
  return { ok: true, checked };
}
