"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type AddPersonState = { error?: MessageKey; ok?: number } | null;

export async function addPerson(_prev: AddPersonState, form: FormData): Promise<AddPersonState> {
  const business = String(form.get("business") ?? "");
  const slug = String(form.get("slug") ?? "");
  const sb = await serverSupabase();
  const { error } = await sb.rpc("add_person", {
    p_business: business,
    p_name: String(form.get("name") ?? "").trim(),
    p_phone: String(form.get("phone") ?? "").trim() || null,
    p_status: form.get("lead") ? "lead" : "active",
    p_source: "manual",
  });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/b/${slug}`);
  revalidatePath(`/b/${slug}/people`);
  return { ok: Date.now() };
}
