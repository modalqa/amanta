import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { getT } from "@/i18n";
import { Landing } from "@/components/landing";
import { str, type SP } from "./_lib/server";

function langOf(sp: Record<string, string | string[] | undefined>): "id" | "en" {
  return str(sp.lang) === "en" ? "en" : "id";
}

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const t = getT(langOf(await searchParams));
  return { title: { absolute: t("landing.metaTitle") }, description: t("landing.metaDescription") };
}

/** Signed-in users go straight to the app; everyone else sees what Amanta is first. */
export default async function Home({ searchParams }: { searchParams: SP }) {
  const s = await getSession();
  if (s) redirect("/app");
  const lang = langOf(await searchParams);
  return <Landing t={getT(lang)} lang={lang} />;
}
