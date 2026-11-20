"use server";
import { anonSupabase } from "@/lib/supabase/anon";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export async function publicSlots(slug: string, offering: string, date: string): Promise<string[]> {
  const { data } = await anonSupabase().rpc("public_slots", { p_slug: slug, p_offering: offering, p_date: date });
  return (data ?? []) as string[];
}

export type BookState = { error?: MessageKey; done?: { offering: string; starts_at: string; location: string | null } } | null;

export async function publicBook(_p: BookState, f: FormData): Promise<BookState> {
  // A hidden field people never fill. Bots often do.
  if (String(f.get("website") ?? "")) return { error: "err.generic" };
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const { data, error } = await anonSupabase().rpc("public_book", {
    p_slug: s("slug"), p_name: s("name"), p_phone: s("phone"), p_email: s("email") || null, p_marketing: f.get("marketing") === "on",
    p_offering: s("offering") || null, p_starts_at: s("slot") || null, p_session: s("session") || null,
  });
  if (error) return { error: errorKey(error.message) };
  return { done: data as { offering: string; starts_at: string; location: string | null } };
}
