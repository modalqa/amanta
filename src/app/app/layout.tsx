import Link from "next/link";
import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { getT } from "@/i18n";
import { logoutAction } from "../(auth)/actions";
import { NavLinks } from "@/components/nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const t = getT(ctx.org.locale);
  const unread = await ctx.db.notification.count({ where: { readAt: null, OR: [{ userId: null }, { userId: ctx.userId ?? "" }] } });
  const groups: Array<{ title: string; items: Array<{ href: string; label: string; show: boolean }> }> = [
    { title: t("nav.operations"), items: [
      { href: "/app", label: t("nav.dashboard"), show: true },
      { href: "/app/checklists", label: t("nav.checklists"), show: can(ctx, "checklists:read") },
      { href: "/app/ccp", label: t("nav.ccp"), show: can(ctx, "ccp:read") },
      { href: "/app/deviations", label: t("nav.deviations"), show: can(ctx, "deviations:read") },
      { href: "/app/capa", label: t("nav.capa"), show: can(ctx, "capa:read") },
    ] },
    { title: t("nav.foodSafetyPlan"), items: [
      { href: "/app/documents", label: t("nav.documents"), show: can(ctx, "documents:read") },
      { href: "/app/haccp", label: t("nav.haccp"), show: can(ctx, "haccp:read") },
      { href: "/app/products", label: t("nav.products"), show: can(ctx, "haccp:read") },
    ] },
    { title: t("nav.supplyChain"), items: [
      { href: "/app/suppliers", label: t("nav.suppliers"), show: can(ctx, "suppliers:read") },
      { href: "/app/ingredients", label: t("nav.ingredients"), show: can(ctx, "traceability:read") },
      { href: "/app/lots", label: t("nav.lots"), show: can(ctx, "traceability:read") },
      { href: "/app/batches", label: t("nav.batches"), show: can(ctx, "traceability:read") },
      { href: "/app/trace", label: t("nav.trace"), show: can(ctx, "traceability:read") },
    ] },
    { title: t("nav.governance"), items: [
      { href: "/app/reports", label: t("nav.reports"), show: can(ctx, "reports:read") },
      { href: "/app/audit", label: t("nav.audit"), show: can(ctx, "audit:read") },
      { href: "/app/settings", label: t("nav.settings"), show: true },
    ] },
  ];
  const nav = groups.map((g) => ({ title: g.title, items: g.items.filter((i) => i.show).map(({ href, label }) => ({ href, label })) }));
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-gray-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/app" className="text-lg font-bold text-brand-700">Amanta</Link>
          <Link href="/app/notifications" className="relative text-sm text-gray-600 lg:hidden" aria-label={t("nav.notifications")}><svg aria-hidden="true" viewBox="0 0 24 24" className="inline h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>{unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{unread}</span>}</Link>
        </div>
        <div className="px-4 pb-2 text-xs text-gray-500">{ctx.org.name}</div>
        <NavLinks groups={nav} />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-end gap-4 border-b border-gray-200 bg-white px-4 py-2 text-sm">
          <Link href="/app/notifications" className="hidden text-gray-700 hover:text-brand-700 lg:inline">{t("nav.notifications")}{unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{unread}</span>}</Link>
          <span className="text-gray-600">{ctx.userName} · <span className="text-gray-500">{t(`roles.${ctx.role}`)}</span></span>
          <form action={logoutAction}><button className="text-gray-600 hover:text-red-700">{t("nav.logout")}</button></form>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
