import { apiRoute } from "@/server/http";
import { listSuppliers } from "@/server/services/suppliers";

export const GET = apiRoute("suppliers:read", async (ctx) => (await listSuppliers(ctx)).map((s) => ({ id: s.id, name: s.name, code: s.code, status: s.status, riskLevel: s.riskLevel, certificates: s.certSummary })));
