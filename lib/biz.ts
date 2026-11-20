import "server-only";
import { notFound, redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";

export type Biz = { id: string; name: string; slug: string; timezone: string };

/** The signed-in user's business by its address, or a 404. Row Level Security decides what they may see. */
export async function requireBusiness(slug: string) {
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await sb.from("businesses").select("id, name, slug, timezone").eq("slug", slug).maybeSingle();
  if (!data) notFound();
  return { sb, biz: data as Biz };
}
