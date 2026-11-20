"use server";
import { redirect } from "next/navigation";
import { anonSupabase } from "@/lib/supabase/anon";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type MState = { error?: MessageKey; ok?: number } | null;
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function clientCancel(_p: MState, f: FormData): Promise<MState> {
  const { error } = await anonSupabase().rpc("public_cancel", { p_token: s(f, "token") });
  if (error) return { error: errorKey(error.message) };
  redirect(`/m/${s(f, "token")}`);
}

export async function clientAlternatives(token: string, date: string | null): Promise<unknown[]> {
  const { data } = await anonSupabase().rpc("public_alternatives", { p_token: token, p_date: date });
  return (data ?? []) as unknown[];
}

export async function clientMove(_p: MState, f: FormData): Promise<MState> {
  const { data, error } = await anonSupabase().rpc("public_move", { p_token: s(f, "token"), p_starts_at: s(f, "slot") || null, p_session: s(f, "session") || null });
  if (error) return { error: errorKey(error.message) };
  redirect(`/m/${data as string}?moved=1`);
}

export async function clientSubmitForm(_p: MState, f: FormData): Promise<MState> {
  const count = Number(s(f, "count"));
  const answers = Array.from({ length: count }, (_, i) => f.get(`q${i}`) === "yes");
  if (Array.from({ length: count }, (_, i) => f.get(`q${i}`)).some((v) => v === null)) return { error: "err.invalid_answers" };
  const { error } = await anonSupabase().rpc("public_submit_form", { p_token: s(f, "token"), p_answers: answers, p_details: s(f, "details") || null,
    p_signed_name: s(f, "signed_name"), p_confirm: f.get("confirm") === "on" });
  if (error) return { error: errorKey(error.message) };
  redirect(`/m/${s(f, "token")}`);
}

export async function clientRequestDeletion(_p: MState, f: FormData): Promise<MState> {
  const { error } = await anonSupabase().rpc("public_request_deletion", { p_token: s(f, "token") });
  if (error) return { error: errorKey(error.message) };
  return { ok: Date.now() };
}
