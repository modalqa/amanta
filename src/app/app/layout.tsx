import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { getT } from "@/i18n";
import { logoutAction } from "../(auth)/actions";
import { Sidebar, type NavGroup } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const t = getT(ctx.org.locale);
  const [unread, openDeviations] = await Promise.all([
    ctx.db.notification.count({ where: { readAt: null, OR: [{ userId: null }, { userId: ctx.userId ?? "" }] } }),
    can(ctx, "deviations:read") ? ctx.db.deviation.count({ where: { status: { not: "CLOSED" } } }) : Promise.resolve(0),
  ]);
  const groups: Array<{ title: string; items: Array<{ href: string; key: string; show: boolean; count?: number }> }> = [
    { title: t("nav.operations"), items: [
      { href: "/app", key: "dashboard", show: true },
      { href: "/app/checklists", key: "checklists", show: can(ctx, "checklists:read") },
      { href: "/app/ccp", key: "ccp", show: can(ctx, "ccp:read") },
      { href: "/app/deviations", key: "deviations", show: can(ctx, "deviations:read"), count: openDeviations },
      { href: "/app/capa", key: "capa", show: can(ctx, "capa:read") },
    ] },
    { title: t("nav.foodSafetyPlan"), items: [
      { href: "/app/documents", key: "documents", show: can(ctx, "documents:read") },
      { href: "/app/haccp", key: "haccp", show: can(ctx, "haccp:read") },
      { href: "/app/products", key: "products", show: can(ctx, "haccp:read") },
    ] },
    { title: t("nav.supplyChain"), items: [
      { href: "/app/suppliers", key: "suppliers", show: can(ctx, "suppliers:read") },
      { href: "/app/ingredients", key: "ingredients", show: can(ctx, "traceability:read") },
      { href: "/app/lots", key: "lots", show: can(ctx, "traceability:read") },
      { href: "/app/batches", key: "batches", show: can(ctx, "traceability:read") },
      { href: "/app/trace", key: "trace", show: can(ctx, "traceability:read") },
    ] },
    { title: t("nav.governance"), items: [
      { href: "/app/reports", key: "reports", show: can(ctx, "reports:read") },
      { href: "/app/audit", key: "audit", show: can(ctx, "audit:read") },
      { href: "/app/settings", key: "settings", show: true },
    ] },
  ];
  const nav: NavGroup[] = groups.map((g) => ({
    title: g.title,
    items: g.items.filter((i) => i.show).map(({ href, key, count }) => ({ href, icon: key, label: t(`nav.${key}`), count })),
  }));
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar
        groups={nav}
        orgName={ctx.org.name}
        userName={ctx.userName ?? ""}
        roleLabel={t(`roles.${ctx.role}`)}
        unread={unread}
        labels={{ notifications: t("nav.notifications"), switchOrg: t("nav.switchOrg"), logout: t("nav.logout"), menu: t("nav.menu"), closeMenu: t("nav.closeMenu") }}
        logoutAction={logoutAction}
      />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
