"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";

export async function removeFromWaitlist(f: FormData) {
  const sb = await serverSupabase();
  await sb.rpc("remove_waitlist", { p_id: String(f.get("id") ?? "") });
  revalidatePath(`/b/${String(f.get("slug") ?? "")}`);
}
