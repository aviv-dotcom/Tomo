"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";

export async function setOrderStatus(f: FormData) {
  const sb = await serverSupabase();
  await sb.rpc("set_order_status", { p_order: String(f.get("order") ?? ""), p_status: String(f.get("status") ?? "") });
  const slug = String(f.get("slug") ?? "");
  revalidatePath(`/b/${slug}`); revalidatePath(`/b/${slug}/orders`);
}
