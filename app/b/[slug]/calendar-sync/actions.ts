"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";

export async function rotateCalendarLink(f: FormData) {
  const sb = await serverSupabase();
  await sb.rpc("calendar_link", { p_business: String(f.get("business") ?? ""), p_rotate: true });
  revalidatePath(`/b/${String(f.get("slug") ?? "")}/calendar-sync`);
}
