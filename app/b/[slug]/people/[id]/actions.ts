"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

export async function forgetPerson(f: FormData): Promise<void> {
  const sb = await serverSupabase();
  const slug = String(f.get("slug") ?? "");
  await sb.rpc("forget_person", { p_person: String(f.get("id") ?? "") });
  revalidatePath(`/b/${slug}/people`);
  redirect(`/b/${slug}/people`);
}

export async function sellPass(_p: SaveState, f: FormData): Promise<SaveState> {
  const sb = await serverSupabase();
  const { error } = await sb.rpc("sell_pass", { p_person: String(f.get("person") ?? ""), p_offering: String(f.get("offering") ?? "") });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/b/${String(f.get("slug") ?? "")}/people/${String(f.get("person") ?? "")}`);
  return { ok: Date.now() };
}

export async function cancelPass(f: FormData) {
  const sb = await serverSupabase();
  await sb.rpc("cancel_pass", { p_pass: String(f.get("pass") ?? "") });
  revalidatePath(`/b/${String(f.get("slug") ?? "")}/people/${String(f.get("person") ?? "")}`);
}

export async function saveNotes(_p: SaveState, f: FormData): Promise<SaveState> {
  const sb = await serverSupabase();
  const { error } = await sb.rpc("set_person_notes", { p_person: String(f.get("person") ?? ""), p_notes: String(f.get("notes") ?? "") });
  if (error) return { error: errorKey(error.message) };
  return { ok: Date.now() };
}
