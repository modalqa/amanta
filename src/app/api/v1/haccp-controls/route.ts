import { apiRoute } from "@/server/http";
import { listControls } from "@/server/services/haccp";

export const GET = apiRoute("haccp:read", async (ctx) => (await listControls(ctx, { status: "APPROVED" })).map((c) => ({ id: c.id, ccpCode: c.ccpCode, isCcp: c.isCcp, processStep: c.processStep, hazardType: c.hazardType, criticalLimitMin: c.criticalLimitMin, criticalLimitMax: c.criticalLimitMax, limitUnit: c.limitUnit, monitoringFrequency: c.monitoringFrequency })));
