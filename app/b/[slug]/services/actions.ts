"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type SvcState = { error?: MessageKey; ok?: number } | null;
const agorot = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const int = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s === "" ? null : Math.round(Number(s)); };

export async function saveOffering(_p: SvcState, f: FormData): Promise<SvcState> {
  const sb = await serverSupabase();
  const slug = String(f.get("slug") ?? "");
  const { error } = await sb.rpc("save_offering", {
    p_business: String(f.get("business") ?? ""), p_id: String(f.get("id") ?? "") || null, p_name: String(f.get("name") ?? ""),
    p_delivery: String(f.get("delivery") ?? "appointment"), p_billing: String(f.get("billing") ?? "one_time"),
    p_minutes: int(f.get("minutes")), p_price_agorot: agorot(f.get("price")), p_deposit_agorot: agorot(f.get("deposit")),
    p_buffer_minutes: int(f.get("buffer")) ?? 0, p_active: f.get("active") === "on",
  });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/b/${slug}/services`); revalidatePath(`/b/${slug}`); revalidatePath(`/p/${slug}`);
  return { ok: Date.now() };
}
