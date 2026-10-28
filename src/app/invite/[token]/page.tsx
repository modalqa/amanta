import { Flash, Field } from "@/components/ui";
import { flash, pageT, type SP } from "../../_lib/server";
import { acceptInviteAction } from "../../(auth)/actions";

export const metadata = { title: "Undangan" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SP }) {
  const { token } = await params;
  const t = await pageT();
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="card w-full max-w-md p-6">
        <h1 className="mb-1 text-lg font-semibold">{t("auth.inviteTitle")}</h1>
        <p className="mb-4 text-sm text-gray-600">{t("auth.inviteSubtitle")}</p>
        <Flash {...flash(t, await searchParams)} />
        <form action={acceptInviteAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <Field label={t("auth.name")}><input name="name" required minLength={2} className="input" /></Field>
          <Field label={t("auth.password")} hint={t("auth.invitePasswordHint")}><input name="password" type="password" required className="input" autoComplete="new-password" /></Field>
          <button className="btn btn-primary w-full">{t("auth.acceptInvite")}</button>
        </form>
      </div>
    </main>
  );
}
