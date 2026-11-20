"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type SaveState = { error?: MessageKey; ok?: number } | null;

export async function savePerson(_prev: SaveState, form: FormData): Promise<SaveState> {
  const id = String(form.get("id") ?? ""), slug = String(form.get("slug") ?? "");
  const sb = await serverSupabase();
  const { error } = await sb.rpc("update_person", {
    p_person: id, p_name: String(form.get("name") ?? ""), p_phone: String(form.get("phone") ?? ""),
    p_email: String(form.get("email") ?? ""), p_status: String(form.get("status") ?? "active"), p_marketing: form.get("marketing") === "on",
  });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/b/${slug}/people/${id}`); revalidatePath(`/b/${slug}/people`);
  return { ok: Date.now() };
}
