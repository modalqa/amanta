import { apiRoute, readJson } from "@/server/http";
import { listCcpRecords, recordCcp } from "@/server/services/ccp";

export const GET = apiRoute("ccp:read", async (ctx, req) => {
  const sp = req.nextUrl.searchParams;
  const since = sp.get("since") ? new Date(sp.get("since")!) : undefined;
  const rows = await listCcpRecords(ctx, { controlId: sp.get("controlId") ?? undefined, since: since && !isNaN(since.getTime()) ? since : undefined });
  return rows.map((r) => ({ id: r.id, ccp: r.haccpControl.ccpCode, controlId: r.haccpControlId, value: r.value, unit: r.unit, withinLimits: r.withinLimits, recordedAt: r.recordedAt, source: r.source, batch: r.batch?.batchNumber ?? null }));
});

/** Sensor/IoT ingestion. Values for temperature CCPs must be in °C. Out-of-limit readings open a deviation. */
export const POST = apiRoute("ccp:record", async (ctx, req) => {
  const res = await recordCcp(ctx, (await readJson(req)) as never, "API");
  return { id: res.record.id, withinLimits: res.record.withinLimits, deviationId: res.deviationId };
});
