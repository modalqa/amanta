"use client";
import { useState } from "react";

type Item = { prompt: string; guidance?: string | null; type: "BOOLEAN" | "NUMBER" | "TEMPERATURE" | "TEXT"; required: boolean; minValue?: number | null; maxValue?: number | null; unit?: string | null; haccpControlId?: string | null };
type Labels = Record<"prompt" | "guidance" | "type" | "required" | "min" | "max" | "unit" | "ccp" | "add" | "remove" | "up" | "down" | "BOOLEAN" | "NUMBER" | "TEMPERATURE" | "TEXT" | "none", string>;

/** Client-side editor for checklist items; serializes to a hidden JSON field validated on the server. */
export function ChecklistBuilder({ initial, ccps, labels }: { initial: Item[]; ccps: Array<{ id: string; label: string }>; labels: Labels }) {
  const [items, setItems] = useState<Item[]>(initial.length ? initial : [{ prompt: "", type: "BOOLEAN", required: true }]);
  const update = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setItems((xs) => { const ys = [...xs]; const j = i + d; if (j < 0 || j >= ys.length) return xs; [ys[i], ys[j]] = [ys[j], ys[i]]; return ys; });
  const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
  return (
    <div className="space-y-3">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      {items.map((it, i) => (
        <div key={i} className="rounded-md border border-gray-200 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <span>#{i + 1}</span>
            <span className="flex gap-2">
              <button type="button" className="link" onClick={() => move(i, -1)}>{labels.up}</button>
              <button type="button" className="link" onClick={() => move(i, 1)}>{labels.down}</button>
              <button type="button" className="text-red-700 hover:underline" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>{labels.remove}</button>
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-6">
            <label className="md:col-span-3"><span className="label">{labels.prompt}</span><input className="input" value={it.prompt} onChange={(e) => update(i, { prompt: e.target.value })} required /></label>
            <label><span className="label">{labels.type}</span>
              <select className="input" value={it.type} onChange={(e) => update(i, { type: e.target.value as Item["type"], unit: e.target.value === "TEMPERATURE" ? "°C" : it.unit })}>
                {(["BOOLEAN", "NUMBER", "TEMPERATURE", "TEXT"] as const).map((x) => <option key={x} value={x}>{labels[x]}</option>)}
              </select>
            </label>
            <label className="md:col-span-2"><span className="label">{labels.ccp}</span>
              <select className="input" value={it.haccpControlId ?? ""} onChange={(e) => update(i, { haccpControlId: e.target.value || null })}>
                <option value="">{labels.none}</option>
                {ccps.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            {(it.type === "NUMBER" || it.type === "TEMPERATURE") && (<>
              <label><span className="label">{labels.min}</span><input className="input" inputMode="decimal" value={it.minValue ?? ""} onChange={(e) => update(i, { minValue: num(e.target.value) })} /></label>
              <label><span className="label">{labels.max}</span><input className="input" inputMode="decimal" value={it.maxValue ?? ""} onChange={(e) => update(i, { maxValue: num(e.target.value) })} /></label>
              <label><span className="label">{labels.unit}</span><input className="input" value={it.unit ?? ""} onChange={(e) => update(i, { unit: e.target.value })} disabled={it.type === "TEMPERATURE"} /></label>
            </>)}
            <label className="md:col-span-2"><span className="label">{labels.guidance}</span><input className="input" value={it.guidance ?? ""} onChange={(e) => update(i, { guidance: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={it.required} onChange={(e) => update(i, { required: e.target.checked })} /> {labels.required}</label>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={() => setItems((xs) => [...xs, { prompt: "", type: "BOOLEAN", required: true }])}>+ {labels.add}</button>
    </div>
  );
}
