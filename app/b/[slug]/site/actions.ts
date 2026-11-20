"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type SiteState = { error?: MessageKey; ok?: number } | null;

export async function saveSite(_p: SiteState, f: FormData): Promise<SiteState> {
  const s = (k: string) => String(f.get(k) ?? "");
  const sb = await serverSupabase();
  const { error } = await sb.rpc("save_page", {
    p_business: s("business"), p_published: f.get("published") === "on", p_tagline: s("tagline"),
    p_about: s("about"), p_whatsapp: s("whatsapp"), p_address: s("address"),
  });
  if (error) return { error: /whatsapp_check/.test(error.message) ? "err.invalid_phone" : errorKey(error.message) };
  revalidatePath(`/b/${s("slug")}/site`); revalidatePath(`/b/${s("slug")}`); revalidatePath(`/p/${s("slug")}`);
  return { ok: Date.now() };
}
