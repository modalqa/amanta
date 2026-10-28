"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell, Boxes, ChevronsUpDown, ClipboardCheck, Factory, FileChartColumn, FileText, History, LayoutDashboard, LogOut, Menu,
  Package, Route, Settings, ShieldCheck, Thermometer, TriangleAlert, Truck, Wheat, Wrench, X, type LucideIcon,
} from "lucide-react";

// Icon keys are strings because components cannot be passed from the server layout to this client component.
const ICONS: Record<string, LucideIcon> = {
  notifications: Bell, dashboard: LayoutDashboard, checklists: ClipboardCheck, ccp: Thermometer, deviations: TriangleAlert, capa: Wrench,
  documents: FileText, haccp: ShieldCheck, products: Package, suppliers: Truck, ingredients: Wheat, lots: Boxes,
  batches: Factory, trace: Route, reports: FileChartColumn, audit: History, settings: Settings,
};

export type NavItem = { href: string; label: string; icon: string; count?: number };
export type NavGroup = { title: string; items: NavItem[] };

type Props = {
  groups: NavGroup[];
  orgName: string;
  userName: string;
  roleLabel: string;
  unread: number;
  labels: { notifications: string; switchOrg: string; logout: string; menu: string; closeMenu: string };
  logoutAction: () => Promise<void>;
};

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`);
}

function Count({ n, tone = "gray" }: { n: number; tone?: "gray" | "red" }) {
  if (!n) return null;
  return <span className={`ml-auto min-w-5 rounded-full px-1.5 text-center font-mono text-[11px] leading-5 ${tone === "red" ? "bg-red-600 text-white" : "bg-gray-200 text-gray-700"}`}>{n > 99 ? "99+" : n}</span>;
}

function Item({ href, label, icon, count, active, tone }: NavItem & { active: boolean; tone?: "gray" | "red" }) {
  const Icon = ICONS[icon] ?? Bell;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${active ? "bg-brand-50 text-brand-800" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
    >
      {active && <span aria-hidden="true" className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" />}
      <Icon aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 ${active ? "text-brand-600" : "text-gray-400 group-hover:text-gray-600"}`} strokeWidth={1.9} />
      <span className="truncate">{label}</span>
      <Count n={count ?? 0} tone={tone} />
    </Link>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

export function Sidebar({ groups, orgName, userName, roleLabel, unread, labels, logoutAction }: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const brand = (
    <Link href="/app" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-brand-600">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white shadow-sm"><ShieldCheck aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2.2} /></span>
      <span className="text-[17px] font-bold tracking-tight text-ink">Amanta</span>
    </Link>
  );

  return (
    <aside className="border-b border-gray-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
      {/* Mobile top bar */}
      <div className="flex h-14 items-center justify-between px-4 lg:hidden">
        {brand}
        <div className="flex items-center gap-1">
          <Link href="/app/notifications" aria-label={labels.notifications} className="relative grid h-10 w-10 place-items-center rounded-lg text-gray-600 hover:bg-gray-100">
            <Bell aria-hidden="true" className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white" />}
          </Link>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="app-nav" aria-label={open ? labels.closeMenu : labels.menu} className="grid h-10 w-10 place-items-center rounded-lg text-gray-700 hover:bg-gray-100">
            {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Closing on any link click keeps the mobile drawer from staying open after navigation. */}
      <div id="app-nav" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }} className={`${open ? "flex" : "hidden"} max-h-[calc(100dvh-3.5rem)] flex-col overflow-y-auto border-t border-gray-100 lg:flex lg:max-h-none lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:border-t-0`}>
        <div className="hidden px-5 pb-2 pt-5 lg:block">{brand}</div>

        <div className="px-3 pt-3 lg:pt-2">
          <Link href="/select-org" title={labels.switchOrg} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 hover:border-gray-300 hover:bg-white">
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">{orgName}</span>
              <span className="block truncate text-xs text-gray-500">{labels.switchOrg}</span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" />
          </Link>
        </div>

        <nav aria-label="Menu" className="flex-1 px-3 pb-4 pt-3 lg:overflow-y-auto">
          <Item href="/app/notifications" label={labels.notifications} icon="notifications" count={unread} tone="red" active={isActive(path, "/app/notifications")} />
          {groups.filter((g) => g.items.length).map((g) => (
            <div key={g.title} className="mt-5">
              <h2 className="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-gray-400">
                {g.title}<span aria-hidden="true" className="h-px flex-1 bg-gray-100" />
              </h2>
              <ul className="space-y-0.5">
                {g.items.map((i) => (
                  <li key={i.href}><Item {...i} tone={i.icon === "deviations" ? "red" : "gray"} active={isActive(path, i.href)} /></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-3 border-t border-gray-100 px-4 py-3">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{initials(userName)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-gray-900">{userName}</span>
            <span className="block truncate text-xs text-gray-500">{roleLabel}</span>
          </span>
          <form action={logoutAction}>
            <button title={labels.logout} aria-label={labels.logout} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700">
              <LogOut aria-hidden="true" className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
