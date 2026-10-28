import { apiRoute, readJson } from "@/server/http";
import { listDeviations, reportDeviation } from "@/server/services/deviations";

export const GET = apiRoute("deviations:read", async (ctx, req) => {
  const open = req.nextUrl.searchParams.get("open") === "true";
  return (await listDeviations(ctx, { open })).map((d) => ({ id: d.id, code: d.code, title: d.title, severity: d.severity, status: d.status, source: d.source, disposition: d.disposition, batch: d.batch?.batchNumber ?? null, createdAt: d.createdAt }));
});
export const POST = apiRoute("deviations:create", async (ctx, req) => {
  const d = await reportDeviation(ctx, (await readJson(req)) as never);
  return { id: d.id, code: d.code };
});
