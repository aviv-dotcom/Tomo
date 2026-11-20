import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect("/");
  return <LoginForm failed={sp.error === "callback"} />;
}
