import { Field } from "@/components/ui";
import type { TFn } from "@/i18n";
import { fromCelsius, isTemperatureUnit } from "@/lib/format";

type Defaults = Partial<{
  id: string; productId: string | null; processStep: string; hazardType: string; hazardDescription: string; severity: number; likelihood: number; isCcp: boolean;
  ccpCode: string | null; justification: string | null; controlMeasure: string; criticalLimitMin: number | null; criticalLimitMax: number | null; limitUnit: string | null;
  criticalLimitText: string | null; monitoringProcedure: string; monitoringFrequency: string; correctiveAction: string; verificationProcedure: string | null; records: string | null;
}>;

export function ControlForm({ t, action, products, defaults = {}, submitLabel, tempUnit }: { t: TFn; action: (f: FormData) => Promise<void>; products: Array<{ id: string; name: string }>; defaults?: Defaults; submitLabel: string; tempUnit: "C" | "F" }) {
  const d = defaults;
  const isTemp = isTemperatureUnit(d.limitUnit);
  const show = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(isTemp ? fromCelsius(v, tempUnit) : v));
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <Field label={t("haccp.product")}><select name="productId" defaultValue={d.productId ?? ""} className="input"><option value="">–</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label={t("haccp.processStep")}><input name="processStep" defaultValue={d.processStep} required className="input" /></Field>
      <Field label={t("haccp.hazardType")}><select name="hazardType" defaultValue={d.hazardType ?? "BIOLOGICAL"} className="input">{["BIOLOGICAL", "CHEMICAL", "PHYSICAL", "ALLERGEN", "HALAL"].map((h) => <option key={h} value={h}>{t(`hazard.${h}`)}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("haccp.severity")}><input type="number" min={1} max={5} name="severity" defaultValue={d.severity ?? 3} required className="input" /></Field>
        <Field label={t("haccp.likelihood")}><input type="number" min={1} max={5} name="likelihood" defaultValue={d.likelihood ?? 3} required className="input" /></Field>
      </div>
      <div className="md:col-span-2"><Field label={t("haccp.hazardDescription")}><textarea name="hazardDescription" defaultValue={d.hazardDescription} required rows={2} className="input" /></Field></div>
      <div className="md:col-span-2"><Field label={t("haccp.controlMeasure")}><textarea name="controlMeasure" defaultValue={d.controlMeasure} required rows={2} className="input" /></Field></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isCcp" defaultChecked={d.isCcp} className="h-4 w-4" /> {t("haccp.isCcp")}</label>
      <Field label={t("haccp.ccpCode")}><input name="ccpCode" defaultValue={d.ccpCode ?? ""} className="input" placeholder="CCP-1" /></Field>
      <div className="md:col-span-2"><Field label={t("haccp.justification")}><textarea name="justification" defaultValue={d.justification ?? ""} rows={2} className="input" /></Field></div>
      <div className="grid grid-cols-3 gap-3 md:col-span-2">
        <Field label={t("haccp.limitMin")}><input name="criticalLimitMin" inputMode="decimal" defaultValue={show(d.criticalLimitMin)} className="input" /></Field>
        <Field label={t("haccp.limitMax")}><input name="criticalLimitMax" inputMode="decimal" defaultValue={show(d.criticalLimitMax)} className="input" /></Field>
        <Field label={t("haccp.limitUnit")} hint={t("haccp.limitUnitHint", { unit: tempUnit })}><input name="limitUnit" defaultValue={isTemp ? `°${tempUnit}` : d.limitUnit ?? ""} className="input" placeholder={`°${tempUnit}, pH, ppm, aw`} /></Field>
      </div>
      <div className="md:col-span-2"><Field label={t("haccp.limitText")}><input name="criticalLimitText" defaultValue={d.criticalLimitText ?? ""} className="input" /></Field></div>
      <Field label={t("haccp.monitoringProcedure")}><textarea name="monitoringProcedure" defaultValue={d.monitoringProcedure} required rows={2} className="input" /></Field>
      <Field label={t("haccp.monitoringFrequency")}><input name="monitoringFrequency" defaultValue={d.monitoringFrequency} required className="input" /></Field>
      <Field label={t("haccp.correctiveAction")}><textarea name="correctiveAction" defaultValue={d.correctiveAction} required rows={2} className="input" /></Field>
      <Field label={t("haccp.verification")}><textarea name="verificationProcedure" defaultValue={d.verificationProcedure ?? ""} rows={2} className="input" /></Field>
      <div className="md:col-span-2"><Field label={t("haccp.records")}><input name="records" defaultValue={d.records ?? ""} className="input" /></Field></div>
      <div className="md:col-span-2"><button className="btn btn-primary">{submitLabel}</button></div>
    </form>
  );
}
