import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError, httpStatus } from "./errors";
import { authenticateApiKey } from "./auth/apikey";
import { ensure, type Ctx } from "./context";
import type { Permission } from "./auth/permissions";

export function clientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: httpStatus(e.code) });
  if (e instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION", message: "invalid_input", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 400 });
  console.error("[api] unhandled", e);
  return NextResponse.json({ error: { code: "INTERNAL", message: "internal_error" } }, { status: 500 });
}

/** Wraps a public API route: API-key auth, permission check, JSON error mapping, no-store caching. */
export function apiRoute<P = Record<string, string>>(perm: Permission, fn: (ctx: Ctx, req: NextRequest, params: P) => Promise<unknown>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const ctx = await authenticateApiKey(req.headers.get("authorization"), clientIp(req));
      ensure(ctx, perm);
      const result = await fn(ctx, req, await context.params);
      return NextResponse.json({ data: result }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson(req: NextRequest, maxBytes = 256 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("VALIDATION", "payload_too_large");
  try { return JSON.parse(text); } catch { throw new AppError("VALIDATION", "invalid_json"); }
}
