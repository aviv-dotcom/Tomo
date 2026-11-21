"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import { timeToMin } from "@/lib/time";
import type { MessageKey } from "@/lib/i18n/messages";

export type ProviderState = { error?: MessageKey; ok?: number } | null;

export async function saveProvider(_p: ProviderState, f: FormData): Promise<ProviderState> {
  const sb = await serverSupabase();
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const offerings = f.get("all_services") === "on" ? null : f.getAll("offering").map(String);
  const hours = f.get("own_hours") === "on"
    ? [0, 1, 2, 3, 4, 5, 6].filter((d) => f.get(`open-${d}`) === "on").map((d) => ({ weekday: d, start: timeToMin(s(`start-${d}`)), end: timeToMin(s(`end-${d}`)) }))
    : null;
  if (offerings && offerings.length === 0) return { error: "err.provider_services" };
  const { error } = await sb.rpc("save_provider", { p_business: s("business"), p_id: s("id") || null, p_name: s("name"), p_color: s("color"),
    p_active: f.get("active") !== "off", p_offerings: offerings, p_hours: hours });
  if (error) return { error: /color_check/.test(error.message) ? "err.generic" : errorKey(error.message) };
  revalidatePath(`/b/${s("slug")}/providers`);
  return { ok: Date.now() };
}
