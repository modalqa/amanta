import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AppError } from "@/server/errors";
import { getOrgContext, getSession } from "@/server/auth/session";
import { getT, errorText, type Locale, type TFn } from "@/i18n";
import type { FormatPrefs } from "@/lib/format";

export async function pageLocale(): Promise<Locale> {
  const ctx = await getOrgContext();
  if (ctx) return ctx.org.locale;
  const s = await getSession();
  return (s?.user.locale as Locale | undefined) ?? "id";
}

export async function pageT(): Promise<TFn> {
  return getT(await pageLocale());
}

export function prefsOf(ctx: { org: { timezone: string; dateFormat: string; temperatureUnit: "C" | "F"; locale: "id" | "en" } }): FormatPrefs {
  return { timezone: ctx.org.timezone, dateFormat: ctx.org.dateFormat, temperatureUnit: ctx.org.temperatureUnit, locale: ctx.org.locale };
}

function safePath(p: string): string {
  return p.startsWith("/") && !p.startsWith("//") ? p : "/app";
}

function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = safePath(path).split("?");
  const params = new URLSearchParams(query);
  params.delete("error"); params.delete("ok");
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

export function errorCode(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return first?.message && /^[a-z0-9_]+$/.test(first.message) ? first.message : `invalid_${first?.path.join("_") || "input"}`;
  }
  console.error("[action] unexpected error", e);
  return "generic";
}

/**
 * Runs a server-action body. On success redirects to the returned path (or `back` with ok=saved);
 * on failure redirects to `back` with ?error=<code>. Next.js redirects/notFound are re-thrown.
 */
export async function runAction(back: string, fn: () => Promise<string | void>, okKey = "saved"): Promise<never> {
  let target: string;
  try {
    const result = await fn();
    target = result ? safePath(result) : withParam(back, "ok", okKey);
  } catch (e) {
    unstable_rethrow(e);
    target = withParam(back, "error", errorCode(e));
  }
  redirect(target);
}

export type SP = Promise<Record<string, string | string[] | undefined>>;

export function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function flash(t: TFn, sp: Record<string, string | string[] | undefined>) {
  const e = str(sp.error);
  const ok = str(sp.ok);
  return { error: e ? errorText(t, e) : null, ok: ok ? t(`ok.${ok}`) : null };
}

export function fd(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}
