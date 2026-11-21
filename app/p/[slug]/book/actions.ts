"use server";
import { anonSupabase } from "@/lib/supabase/anon";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export async function publicSlots(slug: string, offering: string, date: string, addons: string[] = [], provider = ""): Promise<string[]> {
  const { data } = await anonSupabase().rpc("public_slots", { p_slug: slug, p_offering: offering, p_date: date, p_addons: addons.length ? addons : null, p_provider: provider || null });
  return (data ?? []) as string[];
}

export type BookState = { error?: MessageKey; done?: { offering: string; starts_at: string; location: string | null; addons?: string[]; provider?: string | null } } | null;

export async function publicBook(_p: BookState, f: FormData): Promise<BookState> {
  // A hidden field people never fill. Bots often do.
  if (String(f.get("website") ?? "")) return { error: "err.generic" };
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const { data, error } = await anonSupabase().rpc("public_book", {
    p_slug: s("slug"), p_name: s("name"), p_phone: s("phone"), p_email: s("email") || null, p_marketing: f.get("marketing") === "on",
    p_offering: s("offering") || null, p_starts_at: s("slot") || null, p_session: s("session") || null,
    p_addons: f.getAll("addon").map(String).filter(Boolean).length ? f.getAll("addon").map(String).filter(Boolean) : null,
    p_provider: s("provider") || null,
  });
  if (error) return { error: errorKey(error.message) };
  return { done: data as { offering: string; starts_at: string; location: string | null; addons?: string[]; provider?: string | null } };
}

export type WaitState = { error?: MessageKey; done?: { offering: string; date?: string; part?: string; starts_at?: string; token?: string; booking_token?: string } } | null;

/** Joins the waitlist: a day and part of day for an appointment, or a full class. */
export async function publicWaitlist(_p: WaitState, f: FormData): Promise<WaitState> {
  if (String(f.get("website") ?? "")) return { error: "err.generic" };
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const { data, error } = await anonSupabase().rpc("public_waitlist", {
    p_slug: s("slug"), p_name: s("name"), p_phone: s("phone"), p_email: s("email") || null, p_marketing: f.get("marketing") === "on",
    p_offering: s("offering") || null, p_date: s("date") || null, p_part: s("part") || "any", p_session: s("session") || null,
  });
  if (error) return { error: errorKey(error.message) };
  return { done: data as { offering: string; date?: string; part?: string; starts_at?: string; token?: string; booking_token?: string } };
}

export type OrderState = { error?: MessageKey; done?: { total: number; items: { name: string; qty: number }[] } } | null;

/** Orders products from the page; the business confirms and the client pays on pickup. */
export async function publicOrder(_p: OrderState, f: FormData): Promise<OrderState> {
  if (String(f.get("website") ?? "")) return { error: "err.generic" };
  const s = (k: string) => String(f.get(k) ?? "").trim();
  let items: { id: string; qty: number }[] = [];
  try { items = JSON.parse(s("items") || "[]"); } catch { /* checked by the database */ }
  const { data, error } = await anonSupabase().rpc("public_order", {
    p_slug: s("slug"), p_name: s("name"), p_phone: s("phone"), p_email: s("email") || null, p_marketing: f.get("marketing") === "on",
    p_items: items, p_note: s("note") || null,
  });
  if (error) return { error: errorKey(error.message) };
  return { done: data as { total: number; items: { name: string; qty: number }[] } };
}
