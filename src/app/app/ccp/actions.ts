"use server";
import { requireCtx } from "@/server/auth/session";
import { recordCcp } from "@/server/services/ccp";
import { toCelsius, isTemperatureUnit } from "@/lib/format";
import { fd, runAction } from "../../_lib/server";

export async function recordCcpAction(form: FormData) {
  await runAction("/app/ccp", async () => {
    const ctx = await requireCtx("ccp:record");
    const control = await ctx.db.haccpControl.findUnique({ where: { id: fd(form, "haccpControlId") }, select: { limitUnit: true } });
    const raw = Number(fd(form, "value").replace(",", "."));
    const value = control && isTemperatureUnit(control.limitUnit) ? toCelsius(raw, ctx.org.temperatureUnit) : raw;
    const res = await recordCcp(ctx, { haccpControlId: fd(form, "haccpControlId"), value, batchId: fd(form, "batchId"), note: fd(form, "note") });
    return `/app/ccp?ok=${res.deviationId ? "ccp_out_of_limits" : "ccp_recorded"}`;
  });
}
