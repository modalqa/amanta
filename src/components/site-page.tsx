import type { Metadata } from "next";
import { FileWarning } from "lucide-react";
import { getT } from "@/i18n";
import { SITE_PAGES, type SiteSlug } from "@/content/site-pages";
import { SiteFooter, SiteHeader, container, type Lang } from "./marketing";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function siteLang(searchParams: SP): Promise<Lang> {
  const v = (await searchParams).lang;
  return (Array.isArray(v) ? v[0] : v) === "en" ? "en" : "id";
}

export async function siteMetadata(slug: SiteSlug, searchParams: SP): Promise<Metadata> {
  const page = SITE_PAGES[slug][await siteLang(searchParams)];
  return { title: page.title, description: page.lead };
}

/** Renders a public content page (about, security, contact, legal) with the shared site header and footer. */
export async function SitePageView({ slug, searchParams }: { slug: SiteSlug; searchParams: SP }) {
  const lang = await siteLang(searchParams);
  const t = getT(lang);
  const page = SITE_PAGES[slug][lang];
  const path = `/${slug}`;
  const date = page.updated ? new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-GB", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(`${page.updated}T00:00:00+07:00`)) : null;
  return (
    <div lang={lang} className="min-h-screen bg-[#fbfcfb] text-ink">
      <SiteHeader t={t} lang={lang} path={path} />
      <main id="main" className={`${container} py-14 lg:py-20`}>
        <div className="grid gap-12 lg:grid-cols-[220px_1fr] lg:gap-16">
          <aside className="hidden lg:block">
            <nav aria-label={t("site.onThisPage")} className="sticky top-24">
              <h2 className="text-xs font-semibold uppercase tracking-[0.09em] text-gray-400">{t("site.onThisPage")}</h2>
              <ul className="mt-3 space-y-2 border-l border-gray-200 text-sm">
                {page.blocks.map((b) => <li key={b.id}><a href={`#${b.id}`} className="-ml-px block border-l border-transparent pl-3 text-gray-600 hover:border-brand-600 hover:text-ink">{b.h}</a></li>)}
              </ul>
            </nav>
          </aside>
          <article className="max-w-3xl">
            <h1 className="text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">{page.title}</h1>
            <p className="mt-4 text-lg leading-relaxed text-gray-600">{page.lead}</p>
            {date && <p className="mt-4 font-mono text-xs text-gray-500">{t("site.updated")}: {date}</p>}
            {page.draft && (
              <p role="note" className="mt-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <FileWarning aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />{t("site.draftBanner")}
              </p>
            )}
            <div className="mt-10 space-y-10">
              {page.blocks.map((b) => (
                <section key={b.id} id={b.id} className="scroll-mt-24">
                  <h2 className="text-xl font-bold tracking-tight">{b.h}</h2>
                  {b.p?.map((para, i) => <p key={i} className="mt-3 leading-relaxed text-gray-700">{para}</p>)}
                  {b.list && (
                    <ul className="mt-3 space-y-2">
                      {b.list.map((item, i) => <li key={i} className="flex gap-3 leading-relaxed text-gray-700"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{item}</li>)}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>
      <SiteFooter t={t} lang={lang} path={path} />
    </div>
  );
}
