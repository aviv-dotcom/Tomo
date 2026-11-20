import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { StartForm } from "./StartForm";

export const dynamic = "force-dynamic";

export default async function StartPage() {
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  return <StartForm />;
}
