import { requireUser } from "@/server/auth/session";
import { listUserOrganizations } from "@/server/services/accounts";
import { Empty, Flash } from "@/components/ui";
import { flash, pageT, type SP } from "../../_lib/server";
import { logoutAction, selectOrgAction } from "../actions";

export const metadata = { title: "Pilih organisasi" };

export default async function SelectOrgPage({ searchParams }: { searchParams: SP }) {
  const s = await requireUser();
  const t = await pageT();
  const orgs = await listUserOrganizations(s.userId);
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">{t("auth.selectOrg")}</h1>
      <Flash {...flash(t, await searchParams)} />
      {orgs.length === 0 ? <Empty>{t("auth.noOrgs")}</Empty> : (
        <ul className="space-y-2">
          {orgs.map((m) => (
            <li key={m.id}>
              <form action={selectOrgAction}>
                <input type="hidden" name="organizationId" value={m.organization.id} />
                <button className="btn btn-secondary w-full justify-between"><span>{m.organization.name}</span><span className="text-xs text-gray-500">{t(`roles.${m.role}`)}</span></button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={logoutAction} className="mt-4 text-center"><button className="link text-sm">{t("nav.logout")}</button></form>
    </>
  );
}
