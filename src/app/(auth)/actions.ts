"use server";
import { redirect } from "next/navigation";
import { authenticate, registerAccount, acceptInvitation } from "@/server/services/accounts";
import { clientMeta, createSession, destroySession, switchOrganization } from "@/server/auth/session";
import { runAction, fd } from "../_lib/server";

export async function loginAction(form: FormData) {
  await runAction("/login", async () => {
    const { ip } = await clientMeta();
    const { user, defaultOrgId, membershipCount } = await authenticate(fd(form, "email"), fd(form, "password"), ip);
    await createSession(user.id, defaultOrgId);
    return membershipCount === 1 ? "/app" : "/select-org";
  });
}

export async function registerAction(form: FormData) {
  await runAction("/register", async () => {
    const { ip } = await clientMeta();
    const { user, org } = await registerAccount({ name: fd(form, "name"), email: fd(form, "email"), password: fd(form, "password"), organizationName: fd(form, "organizationName") }, ip);
    await createSession(user.id, org.id);
    return "/app/settings?ok=welcome";
  });
}

export async function acceptInviteAction(form: FormData) {
  const token = fd(form, "token");
  await runAction(`/invite/${encodeURIComponent(token)}`, async () => {
    const { ip } = await clientMeta();
    const { user, organizationId } = await acceptInvitation({ token, name: fd(form, "name"), password: fd(form, "password") }, ip);
    await createSession(user.id, organizationId);
    return "/app";
  });
}

export async function selectOrgAction(form: FormData) {
  const ok = await switchOrganization(fd(form, "organizationId"));
  redirect(ok ? "/app" : "/select-org?error=forbidden");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
