import Link from "next/link";
import { Flash, Field } from "@/components/ui";
import { flash, pageT, type SP } from "../../_lib/server";
import { registerAction } from "../actions";

export const metadata = { title: "Daftar" };

export default async function RegisterPage({ searchParams }: { searchParams: SP }) {
  const t = await pageT();
  const f = flash(t, await searchParams);
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">{t("auth.registerTitle")}</h1>
      <p className="mb-4 text-sm text-gray-600">{t("auth.registerSubtitle")}</p>
      <Flash {...f} />
      <form action={registerAction} className="space-y-4">
        <Field label={t("auth.organizationName")}><input name="organizationName" required minLength={2} maxLength={120} className="input" placeholder="PT Pangan Sejahtera" /></Field>
        <Field label={t("auth.name")}><input name="name" required minLength={2} maxLength={100} autoComplete="name" className="input" /></Field>
        <Field label={t("auth.email")}><input name="email" type="email" required autoComplete="email" className="input" /></Field>
        <Field label={t("auth.password")} hint={t("auth.passwordHint")}><input name="password" type="password" required minLength={10} autoComplete="new-password" className="input" /></Field>
        <button className="btn btn-primary w-full">{t("auth.register")}</button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-600">{t("auth.haveAccount")} <Link className="link" href="/login">{t("auth.login")}</Link></p>
    </>
  );
}
