import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { TFn } from "@/i18n";

export type Lang = "id" | "en";

export const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

/** Public-site link that keeps the visitor's language. Anchors on the home page stay anchors. */
export function siteHref(path: string, lang: Lang) {
  if (lang === "id") return path;
  const [base, hash] = path.split("#");
  return `${base || "/"}?lang=en${hash ? `#${hash}` : ""}`;
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`grid place-items-center rounded-lg bg-brand-600 text-white ${small ? "h-6 w-6" : "h-8 w-8"}`}><ShieldCheck aria-hidden="true" className={small ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} strokeWidth={2.2} /></span>
      <span className={`font-bold tracking-tight text-ink ${small ? "text-sm" : "text-[17px]"}`}>Amanta</span>
    </span>
  );
}

/** `path` is the current page, used for the language switch. */
export function SiteHeader({ t, lang, path }: { t: TFn; lang: Lang; path: string }) {
  const other = lang === "id" ? `${path}?lang=en` : path;
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-[#fbfcfb]/90 backdrop-blur">
      <div className={`${container} flex h-16 items-center justify-between gap-4`}>
        <Link href={siteHref("/", lang)} aria-label="Amanta"><Logo /></Link>
        <nav aria-label={t("landing.navLabel")} className="hidden items-center gap-7 text-sm font-medium text-gray-600 md:flex">
          <Link href={siteHref("/#cara-kerja", lang)} className="hover:text-ink">{t("landing.navHow")}</Link>
          <Link href={siteHref("/#fitur", lang)} className="hover:text-ink">{t("landing.navFeatures")}</Link>
          <Link href={siteHref("/#ai", lang)} className="hover:text-ink">{t("landing.navAi")}</Link>
          <Link href={siteHref("/tentang", lang)} className="hover:text-ink">{t("site.about")}</Link>
          <Link href={other} className="font-mono text-xs uppercase tracking-wider text-gray-500 hover:text-ink">{t("landing.langSwitch")}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">{t("landing.login")}</Link>
          <Link href="/register" className="btn btn-primary hidden rounded-lg sm:inline-flex">{t("landing.register")}</Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ t, lang, path }: { t: TFn; lang: Lang; path: string }) {
  const other = lang === "id" ? `${path}?lang=en` : path;
  const cols: Array<[string, Array<[string, string]>]> = [
    [t("site.colProduct"), [[t("landing.navHow"), "/#cara-kerja"], [t("landing.navFeatures"), "/#fitur"], [t("landing.navAi"), "/#ai"], [t("site.security"), "/keamanan"]]],
    [t("site.colCompany"), [[t("site.about"), "/tentang"], [t("site.contact"), "/kontak"]]],
    [t("site.colLegal"), [[t("site.terms"), "/syarat-ketentuan"], [t("site.privacy"), "/kebijakan-privasi"]]],
    [t("site.colAccount"), [[t("landing.login"), "/login"], [t("landing.register"), "/register"]]],
  ];
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className={`${container} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]`}>
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-gray-600">{t("site.tagline")}</p>
          <Link href={other} className="mt-5 inline-flex rounded-md border border-gray-300 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-gray-600 hover:border-gray-400 hover:text-ink">{t("landing.langSwitch")}</Link>
        </div>
        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.09em] text-gray-400">{title}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {links.map(([label, href]) => (
                <li key={href}><Link href={href.startsWith("/login") || href.startsWith("/register") ? href : siteHref(href, lang)} className="text-gray-700 hover:text-brand-700">{label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-gray-100">
        <div className={`${container} flex flex-col gap-2 py-5 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between`}>
          <span>© {new Date().getFullYear()} Amanta · {t("landing.footer")}</span>
          <span>{t("site.disclaimerShort")}</span>
        </div>
      </div>
    </footer>
  );
}
