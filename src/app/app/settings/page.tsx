import { requireCtx } from "@/server/auth/session";
import { can } from "@/server/context";
import { getOrganization } from "@/server/services/settings";
import { getT } from "@/i18n";
import { Card, Field, Flash, PageHeader } from "@/components/ui";
import { flash, type SP } from "../../_lib/server";
import { orgSettingsAction } from "./actions";
import { SettingsTabs } from "./tabs";

export const metadata = { title: "Pengaturan" };

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const t = getT(ctx.org.locale);
  const org = await getOrganization(ctx);
  const edit = can(ctx, "org:manage");
  return (
    <>
      <PageHeader title={t("settings.title")} />
      <SettingsTabs t={t} active="/app/settings" admin={can(ctx, "members:manage")} />
      <Flash {...flash(t, await searchParams)} />
      <Card>
        <form action={orgSettingsAction} className="grid gap-3 md:grid-cols-3">
          <fieldset disabled={!edit} className="contents">
            <Field label={t("settings.orgName")}><input name="name" defaultValue={org.name} required className="input" /></Field>
            <Field label={t("settings.legalName")}><input name="legalName" defaultValue={org.legalName ?? ""} className="input" placeholder="PT ..." /></Field>
            <Field label="NIB" hint={t("settings.nibHint")}><input name="nib" defaultValue={org.nib ?? ""} inputMode="numeric" pattern="[0-9]{13}" className="input" /></Field>
            <div className="md:col-span-2"><Field label={t("suppliers.address")}><input name="address" defaultValue={org.address ?? ""} className="input" /></Field></div>
            <Field label={t("settings.province")}><input name="province" defaultValue={org.province ?? ""} className="input" /></Field>
            <Field label={t("settings.timezone")}><select name="timezone" defaultValue={org.timezone} className="input"><option value="Asia/Jakarta">WIB (Asia/Jakarta)</option><option value="Asia/Makassar">WITA (Asia/Makassar)</option><option value="Asia/Jayapura">WIT (Asia/Jayapura)</option></select></Field>
            <Field label={t("settings.language")}><select name="locale" defaultValue={org.locale} className="input"><option value="id">Bahasa Indonesia</option><option value="en">English</option></select></Field>
            <Field label={t("settings.dateFormat")}><select name="dateFormat" defaultValue={org.dateFormat} className="input">{["dd/MM/yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "d MMM yyyy"].map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
            <Field label={t("settings.temperatureUnit")}><select name="temperatureUnit" defaultValue={org.temperatureUnit} className="input"><option value="C">°C</option><option value="F">°F</option></select></Field>
            <Field label={t("settings.weightUnit")}><select name="weightUnit" defaultValue={org.weightUnit} className="input">{["kg", "g", "ton", "lb"].map((u) => <option key={u}>{u}</option>)}</select></Field>
            {edit && <div className="md:col-span-3"><button className="btn btn-primary">{t("common.saveChanges")}</button></div>}
          </fieldset>
        </form>
      </Card>
    </>
  );
}
