"use client";
import { useMemo, useState } from "react";

type Item = { id: string; seq: number; prompt: string; guidance: string | null; type: "BOOLEAN" | "NUMBER" | "TEMPERATURE" | "TEXT"; required: boolean; minValue: number | null; maxValue: number | null; unit: string | null; expectedBool: boolean | null; ccp: string | null };
type Value = { valueBool?: boolean | null; valueNumber?: number | null; valueText?: string | null; note?: string | null };

/** Touch-friendly checklist form. Shows live pass/fail per item; the server re-evaluates authoritatively. */
export function ChecklistRunner({ items, tempUnit, labels }: { items: Item[]; tempUnit: "C" | "F"; labels: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, Value>>({});
  const toDisplay = (c: number | null) => (c === null ? null : tempUnit === "F" ? Math.round(((c * 9) / 5 + 32) * 10) / 10 : c);
  const set = (id: string, v: Value) => setValues((s) => ({ ...s, [id]: { ...s[id], ...v } }));
  const status = (it: Item): "ok" | "fail" | "empty" => {
    const v = values[it.id];
    if (it.type === "BOOLEAN") return v?.valueBool == null ? "empty" : v.valueBool === (it.expectedBool ?? true) ? "ok" : "fail";
    if (it.type === "TEXT") return v?.valueText ? "ok" : "empty";
    if (v?.valueNumber == null || Number.isNaN(v.valueNumber)) return "empty";
    const min = it.type === "TEMPERATURE" ? toDisplay(it.minValue) : it.minValue;
    const max = it.type === "TEMPERATURE" ? toDisplay(it.maxValue) : it.maxValue;
    return (min === null || v.valueNumber >= min) && (max === null || v.valueNumber <= max) ? "ok" : "fail";
  };
  const payload = useMemo(() => JSON.stringify(items.map((it) => ({ itemId: it.id, isTemp: it.type === "TEMPERATURE", ...values[it.id] }))), [items, values]);
  const failures = items.filter((it) => status(it) === "fail").length;
  return (
    <div className="space-y-3">
      <input type="hidden" name="responses" value={payload} />
      {items.map((it) => {
        const st = status(it);
        const unit = it.type === "TEMPERATURE" ? `°${tempUnit}` : it.unit ?? "";
        const min = it.type === "TEMPERATURE" ? toDisplay(it.minValue) : it.minValue;
        const max = it.type === "TEMPERATURE" ? toDisplay(it.maxValue) : it.maxValue;
        return (
          <fieldset key={it.id} className={`rounded-lg border-2 bg-white p-4 ${st === "fail" ? "border-red-400" : st === "ok" ? "border-green-400" : "border-gray-200"}`}>
            <legend className="px-1 text-sm font-medium">{it.seq}. {it.prompt} {it.required && <span className="text-red-600">*</span>} {it.ccp && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs text-red-800">{it.ccp}</span>}</legend>
            {it.guidance && <p className="mb-2 text-xs text-gray-600">{it.guidance}</p>}
            {(min !== null || max !== null) && <p className="mb-2 text-xs text-gray-600">{labels.limit}: {min ?? "–"} … {max ?? "–"} {unit}</p>}
            {it.type === "BOOLEAN" && (
              <div className="flex gap-3">
                {[true, false].map((b) => (
                  <label key={String(b)} className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-md border text-base font-medium ${values[it.id]?.valueBool === b ? (b ? "border-green-600 bg-green-50" : "border-red-600 bg-red-50") : "border-gray-300"}`}>
                    <input type="radio" className="sr-only" name={`b-${it.id}`} checked={values[it.id]?.valueBool === b} onChange={() => set(it.id, { valueBool: b })} />
                    {b ? labels.yes : labels.no}
                  </label>
                ))}
              </div>
            )}
            {(it.type === "NUMBER" || it.type === "TEMPERATURE") && (
              <div className="flex items-center gap-2">
                <input aria-label={it.prompt} className="input h-12 max-w-[200px] text-lg" inputMode="decimal" onChange={(e) => set(it.id, { valueNumber: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })} />
                <span className="text-gray-600">{unit}</span>
              </div>
            )}
            {it.type === "TEXT" && <textarea aria-label={it.prompt} className="input" rows={2} onChange={(e) => set(it.id, { valueText: e.target.value })} />}
            {st === "fail" && <input className="input mt-2" placeholder={labels.notePlaceholder} onChange={(e) => set(it.id, { note: e.target.value })} />}
          </fieldset>
        );
      })}
      {failures > 0 && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{labels.failWarning.replace("{n}", String(failures))}</div>}
    </div>
  );
}
