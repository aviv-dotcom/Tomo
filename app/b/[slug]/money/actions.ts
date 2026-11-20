"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type MoneyState = { error?: MessageKey; ok?: number } | null;
const agorot = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const refresh = (slug: string, person: string) => { revalidatePath(`/b/${slug}/people/${person}`); revalidatePath(`/b/${slug}/money`); revalidatePath(`/b/${slug}`); };

export async function recordPayment(_p: MoneyState, f: FormData): Promise<MoneyState> {
  const sb = await serverSupabase();
  const person = String(f.get("person") ?? ""), slug = String(f.get("slug") ?? "");
  const { error } = await sb.rpc("record_payment", { p_business: String(f.get("business") ?? ""), p_person: person,
    p_amount_agorot: agorot(f.get("amount")), p_method: String(f.get("method") ?? "cash"), p_note: String(f.get("note") ?? "") || null });
  if (error) return { error: /amount_agorot|payments_check/.test(error.message) ? "err.invalid_price" : errorKey(error.message) };
  refresh(slug, person); return { ok: Date.now() };
}

export async function addCharge(_p: MoneyState, f: FormData): Promise<MoneyState> {
  const sb = await serverSupabase();
  const person = String(f.get("person") ?? ""), slug = String(f.get("slug") ?? "");
  const { error } = await sb.rpc("add_charge", { p_business: String(f.get("business") ?? ""), p_person: person,
    p_description: String(f.get("description") ?? ""), p_amount_agorot: agorot(f.get("amount")) });
  if (error) return { error: errorKey(error.message) };
  refresh(slug, person); return { ok: Date.now() };
}

export async function voidCharge(f: FormData): Promise<void> {
  const sb = await serverSupabase();
  await sb.rpc("void_charge", { p_charge: String(f.get("charge") ?? "") });
  refresh(String(f.get("slug") ?? ""), String(f.get("person") ?? ""));
}
