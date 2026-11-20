"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { savedUrl } from "@/lib/back";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type FormsState = { error?: MessageKey; ok?: number } | null;

export async function saveForm(_p: FormsState, f: FormData): Promise<FormsState> {
  const sb = await serverSupabase();
  const questions = String(f.get("questions") ?? "").split("\n").map((q) => q.trim()).filter(Boolean);
  const { error } = await sb.rpc("save_form", { p_business: String(f.get("business") ?? ""), p_enabled: f.get("enabled") === "on", p_questions: questions });
  if (error) return { error: errorKey(error.message) };
  const slug = String(f.get("slug") ?? "");
  revalidatePath(`/b/${slug}`, "layout");
  redirect(savedUrl(slug, String(f.get("back") ?? ""), "forms"));
}
