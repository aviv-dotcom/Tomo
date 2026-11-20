"use server";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { templateByKey } from "@/lib/templates";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type StartState = { error?: MessageKey } | null;

/** Creates the business, then copies the chosen template into it. The database validates every value. */
export async function createBusiness(_prev: StartState, form: FormData): Promise<StartState> {
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const tpl = templateByKey(String(form.get("template") ?? "")) ?? templateByKey("custom")!;
  const sb = await serverSupabase();
  const { data: id, error } = await sb.rpc("create_business", { p_name: name, p_slug: slug, p_template: tpl.key });
  if (error) return { error: errorKey(error.message) };
  const { error: setupError } = await sb.rpc("setup_business", {
    p_business: id, p_vocabulary: tpl.vocabulary, p_modules: tpl.modules, p_offerings: tpl.sampleOfferings,
  });
  if (setupError) return { error: errorKey(setupError.message) };
  redirect(`/b/${slug}`);
}
