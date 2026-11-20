"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type SettingsState = { error?: MessageKey; ok?: number } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function updateBusiness(_p: SettingsState, f: FormData): Promise<SettingsState> {
  const sb = await serverSupabase();
  const oldSlug = str(f, "old_slug");
  const { data, error } = await sb.rpc("update_business", { p_business: str(f, "business"), p_name: str(f, "name"), p_slug: str(f, "slug") });
  if (error) return { error: errorKey(error.message) };
  revalidatePath("/", "layout");
  if (data !== oldSlug) redirect(`/b/${data}/settings?saved=business`);
  return { ok: Date.now() };
}

export async function saveCancelHours(_p: SettingsState, f: FormData): Promise<SettingsState> {
  const sb = await serverSupabase();
  const { error } = await sb.rpc("set_cancel_hours", { p_business: str(f, "business"), p_hours: Number(str(f, "hours")) });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/b/${str(f, "slug")}/settings`);
  return { ok: Date.now() };
}
