import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/server/auth/session";
import { readDocumentFile } from "@/server/services/documents";
import { errorResponse } from "@/server/http";
import { AppError } from "@/server/errors";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getOrgContext();
    if (!ctx) throw new AppError("UNAUTHENTICATED", "login_required");
    const { id } = await params;
    const f = await readDocumentFile(ctx, id);
    return new NextResponse(new Uint8Array(f.bytes), {
      headers: {
        "content-type": f.mimeType,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
        "content-security-policy": "sandbox",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
