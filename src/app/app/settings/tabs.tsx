import Link from "next/link";
import type { TFn } from "@/i18n";
export function SettingsTabs({ t, active, admin }: { t: TFn; active: string; admin: boolean }) {
  const tabs = [["/app/settings", t("settings.organization")], ...(admin ? [["/app/settings/members", t("settings.members")], ["/app/settings/api-keys", t("settings.apiKeys")], ["/app/settings/ai", t("settings.ai")]] : [])];
  return <div className="mb-4 flex flex-wrap gap-2">{tabs.map(([h, l]) => <Link key={h} href={h} className={`btn ${active === h ? "btn-primary" : "btn-secondary"}`}>{l}</Link>)}</div>;
}
