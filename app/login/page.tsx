import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect(sp.next && /^\/join\/[0-9a-f-]{36}$/i.test(sp.next) ? sp.next : "/");
  return <LoginForm failed={sp.error === "callback"} next={sp.next} />;
}
