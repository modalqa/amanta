export type FormatPrefs = { timezone: string; dateFormat: string; temperatureUnit: "C" | "F"; locale: "id" | "en" };

const MONTHS = {
  id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const TZ_LABEL: Record<string, string> = { "Asia/Jakarta": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };

function parts(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), min: g("minute") };
}

export function formatDate(value: Date | string | null | undefined, prefs: FormatPrefs): string {
  if (!value) return "–";
  const d = typeof value === "string" ? new Date(value) : value;
  const p = parts(d, prefs.timezone);
  switch (prefs.dateFormat) {
    case "dd-MM-yyyy": return `${p.d}-${p.m}-${p.y}`;
    case "yyyy-MM-dd": return `${p.y}-${p.m}-${p.d}`;
    case "d MMM yyyy": return `${Number(p.d)} ${MONTHS[prefs.locale][Number(p.m) - 1]} ${p.y}`;
    default: return `${p.d}/${p.m}/${p.y}`;
  }
}

export function formatDateTime(value: Date | string | null | undefined, prefs: FormatPrefs): string {
  if (!value) return "–";
  const d = typeof value === "string" ? new Date(value) : value;
  const p = parts(d, prefs.timezone);
  return `${formatDate(d, prefs)} ${p.h}:${p.min} ${TZ_LABEL[prefs.timezone] ?? ""}`.trim();
}

/** Values are stored in °C. Converts for display when the organization prefers °F. */
export function displayTemp(celsius: number | null | undefined, prefs: Pick<FormatPrefs, "temperatureUnit">): string {
  if (celsius === null || celsius === undefined) return "–";
  if (prefs.temperatureUnit === "F") return `${round1((celsius * 9) / 5 + 32)} °F`;
  return `${round1(celsius)} °C`;
}

export function toCelsius(value: number, unit: "C" | "F"): number {
  return unit === "F" ? round1(((value - 32) * 5) / 9) : value;
}
export function fromCelsius(value: number, unit: "C" | "F"): number {
  return unit === "F" ? round1((value * 9) / 5 + 32) : value;
}

export function isTemperatureUnit(unit: string | null | undefined): boolean {
  return !!unit && /°\s*[cf]\b|celsius|^\s*[cf]\s*$/i.test(unit);
}

/** Formats a measured value with its unit, converting temperatures to the org preference. */
export function displayValue(value: number | null | undefined, unit: string | null | undefined, prefs: FormatPrefs): string {
  if (value === null || value === undefined) return "–";
  if (isTemperatureUnit(unit)) return displayTemp(value, prefs);
  return `${formatNumber(value, prefs)}${unit ? " " + unit : ""}`;
}

export function formatNumber(n: number, prefs: Pick<FormatPrefs, "locale">): string {
  return new Intl.NumberFormat(prefs.locale === "id" ? "id-ID" : "en-US", { maximumFractionDigits: 2 }).format(n);
}

function round1(n: number) { return Math.round(n * 10) / 10; }
