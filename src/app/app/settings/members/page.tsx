import { cookies } from "next/headers";
import { requireCtx } from "@/server/auth/session";
import { listMembers } from "@/server/services/accounts";
import { assignableRoles } from "@/server/auth/permissions";
import { getT } from "@/i18n";
import { Badge, Card, Field, Flash, PageHeader, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { flash, prefsOf, type SP } from "../../../_lib/server";
import { inviteAction, memberAction } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Anggota" };

export default async function MembersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("members:manage");
  const t = getT(ctx.org.locale);
  const p = prefsOf(ctx);
  const [members, invites] = await Promise.all([listMembers(ctx), ctx.db.invitation.findMany({ where: { acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } })]);
  const inviteLink = (await cookies()).get("amanta_flash_invite")?.value;
  const roles = assignableRoles(ctx.role!);
  return (
    <>
      <PageHeader title={t("settings.title")} />
      <SettingsTabs t={t} active="/app/settings/members" admin />
      <Flash {...flash(t, await searchParams)} />
      {inviteLink && <div className="mb-4 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm"><div className="font-medium">{t("settings.inviteLinkOnce")}</div><code className="mt-1 block break-all rounded bg-white p-2 text-xs">{inviteLink}</code></div>}
      <Card title={t("settings.invite")} className="mb-4">
        <form action={inviteAction} className="flex flex-wrap items-end gap-2">
          <Field label={t("auth.email")}><input type="email" name="email" required className="input" /></Field>
          <Field label={t("settings.role")}><select name="role" className="input" defaultValue="OPERATOR">{roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select></Field>
          <button className="btn btn-primary">{t("settings.sendInvite")}</button>
        </form>
        {invites.length > 0 && <ul className="mt-3 text-xs text-gray-600">{invites.map((i) => <li key={i.id}>{i.email} · {t(`roles.${i.role}`)} · {t("settings.expires")} {formatDateTime(i.expiresAt, p)}</li>)}</ul>}
        <p className="mt-2 text-xs text-gray-500">{t("settings.roleHelp")}</p>
      </Card>
      <Table head={[t("auth.name"), t("auth.email"), t("settings.role"), t("common.status"), t("settings.lastLogin"), ""]}>
        {members.map((m) => (
          <tr key={m.id}>
            <td>{m.user.name}</td><td className="text-xs">{m.user.email}</td>
            <td>{m.userId === ctx.userId ? t(`roles.${m.role}`) : (
              <form action={memberAction} className="flex gap-1"><input type="hidden" name="membershipId" value={m.id} /><input type="hidden" name="op" value="role" />
                <select name="role" defaultValue={m.role} className="input py-1 text-xs">{[...new Set([m.role, ...roles])].map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select>
                <button className="btn btn-secondary px-2 py-1 text-xs">{t("common.save")}</button></form>
            )}</td>
            <td><Badge tone={m.active ? "green" : "gray"}>{m.active ? t("settings.active") : t("settings.inactive")}</Badge></td>
            <td className="text-xs">{formatDateTime(m.user.lastLoginAt, p)}</td>
            <td>{m.userId !== ctx.userId && <form action={memberAction}><input type="hidden" name="membershipId" value={m.id} /><input type="hidden" name="op" value={m.active ? "deactivate" : "activate"} /><button className="text-xs text-red-700 hover:underline">{m.active ? t("settings.deactivate") : t("settings.activate")}</button></form>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
