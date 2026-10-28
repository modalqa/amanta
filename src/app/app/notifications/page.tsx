import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/auth/session";
import { listNotifications, markNotificationsRead } from "@/server/services/settings";
import { getT } from "@/i18n";
import { Empty, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { prefsOf } from "../../_lib/server";

export const metadata = { title: "Notifikasi" };

async function markAll() {
  "use server";
  const ctx = await requireCtx();
  await markNotificationsRead(ctx);
  revalidatePath("/app", "layout");
}

export default async function NotificationsPage() {
  const ctx = await requireCtx();
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const items = await listNotifications(ctx);
  return (
    <>
      <PageHeader title={t("nav.notifications")} actions={<form action={markAll}><button className="btn btn-secondary">{t("notifications.markAll")}</button></form>} />
      {items.length === 0 ? <Empty>{t("notifications.empty")}</Empty> : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {items.map((n) => (
            <li key={n.id} className={`p-3 text-sm ${n.readAt ? "" : "bg-brand-50"}`}>
              <div className="flex justify-between gap-2"><span className="font-medium">{n.link ? <Link className="link" href={n.link}>{n.title}</Link> : n.title}</span><span className="text-xs text-gray-500">{formatDateTime(n.createdAt, p)}</span></div>
              {n.body && <div className="text-xs text-gray-600">{n.body}</div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
