import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

export default async function Home() {
  const s = await getSession();
  redirect(s ? "/app" : "/login");
}
