import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/server/auth/session";
import { generateReport, type ReportFormat, type ReportKind } from "@/server/reports";
import { errorResponse } from "@/server/http";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";

const KINDS: ReportKind[] = ["haccp-plan", "ccp-log", "deviations-capa", "batch-trace", "suppliers", "audit-trail", "audit-package"];
const FORMATS: ReportFormat[] = ["pdf", "csv", "xlsx"];

const OFFSETS: Record<string, string> = { "Asia/Jakarta": "+07:00", "Asia/Makassar": "+08:00", "Asia/Jayapura": "+09:00" };

/** Interprets a yyyy-mm-dd date in the organization's timezone (WIB/WITA/WIT). */
function parseDate(v: string | null, tz: string, endOfDay = false): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}${OFFSETS[tz] ?? "+07:00"}`);
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getOrgContext();
    if (!ctx) throw new AppError("UNAUTHENTICATED", "login_required");
    await rateLimit(`report:${ctx.orgId}:${ctx.userId}`, 60, 3600);
    const sp = req.nextUrl.searchParams;
    const kind = sp.get("kind") as ReportKind;
    const format = (sp.get("format") ?? "pdf") as ReportFormat;
    if (!KINDS.includes(kind) || !FORMATS.includes(format)) throw new AppError("VALIDATION", "unknown_report");
    const f = await generateReport(ctx, kind, format, { from: parseDate(sp.get("from"), ctx.org.timezone), to: parseDate(sp.get("to"), ctx.org.timezone, true), batchId: sp.get("batchId") ?? undefined });
    return new NextResponse(new Uint8Array(f.bytes), {
      headers: { "content-type": f.mime, "content-disposition": `attachment; filename="${f.filename}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
