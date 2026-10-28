import { requireCtx } from "@/server/auth/session";
import { listProducts } from "@/server/services/haccp";
import { getT } from "@/i18n";
import { Card, Flash, PageHeader } from "@/components/ui";
import { flash, type SP } from "../../../_lib/server";
import { createControlAction } from "../actions";
import { ControlForm } from "../control-form";

export const metadata = { title: "Kontrol baru" };

export default async function NewControlPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx("haccp:write");
  const t = getT(ctx.org.locale);
  const products = await listProducts(ctx);
  return (
    <>
      <PageHeader title={t("haccp.newControl")} subtitle={t("haccp.newControlHelp")} />
      <Flash {...flash(t, await searchParams)} />
      <Card><ControlForm t={t} action={createControlAction} products={products} submitLabel={t("common.save")} tempUnit={ctx.org.temperatureUnit} /></Card>
    </>
  );
}
