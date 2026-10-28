import { id } from "./id";
import { en } from "./en";

export type Locale = "id" | "en";
export type Dict = typeof id;
const DICTS: Record<Locale, Record<string, string>> = { id: flatten(id), en: flatten(en as unknown as Dict) };

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v as Record<string, unknown>, key));
  }
  return out;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function getT(locale: Locale): TFn {
  const d = DICTS[locale] ?? DICTS.id;
  return (key, vars) => {
    let s = d[key] ?? DICTS.id[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

export function dictFor(locale: Locale): Record<string, string> { return DICTS[locale] ?? DICTS.id; }

/** Translates an error code (AppError.message) with fallback to a generic message. */
export function errorText(t: TFn, code: string): string {
  const s = t(`errors.${code}`);
  if (s !== `errors.${code}`) return s;
  if (code.startsWith("invalid_")) return t("errors.invalid_field", { field: code.slice(8) });
  return t("errors.generic");
}

export const allKeys = { id: () => Object.keys(DICTS.id), en: () => Object.keys(DICTS.en) };
