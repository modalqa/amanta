import Link from "next/link";
import { Flash, Field } from "@/components/ui";
import { flash, pageT, type SP } from "../../_lib/server";
import { loginAction } from "../actions";

export const metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const t = await pageT();
  const f = flash(t, await searchParams);
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">{t("auth.loginTitle")}</h1>
      <Flash {...f} />
      <form action={loginAction} className="space-y-4">
        <Field label={t("auth.email")}><input name="email" type="email" autoComplete="email" required className="input" /></Field>
        <Field label={t("auth.password")}><input name="password" type="password" autoComplete="current-password" required className="input" /></Field>
        <button className="btn btn-primary w-full">{t("auth.login")}</button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-600">{t("auth.noAccount")} <Link className="link" href="/register">{t("auth.registerLink")}</Link></p>
    </>
  );
}
