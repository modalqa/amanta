import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Does not leak configuration details. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
