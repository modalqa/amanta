"use server";
import { requireCtx } from "@/server/auth/session";
import { completeCapa, rejectCapa, startCapa, verifyCapa } from "@/server/services/capa";
import { fd, runAction } from "../../_lib/server";

export async function startAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/capa/${id}`, async () => { await startCapa(await requireCtx("capa:work"), id); });
}
export async function completeAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/capa/${id}`, async () => { await completeCapa(await requireCtx("capa:work"), id, fd(form, "completionNote")); });
}
export async function verifyAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/capa/${id}`, async () => { await verifyCapa(await requireCtx("capa:verify"), id, fd(form, "effective") === "yes", fd(form, "note")); });
}
export async function rejectAction(form: FormData) {
  const id = fd(form, "id");
  await runAction(`/app/capa/${id}`, async () => { await rejectCapa(await requireCtx("capa:manage"), id, fd(form, "reason")); });
}
