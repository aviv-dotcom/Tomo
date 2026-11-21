"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { forgetWithPhotos } from "@/lib/forget";
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
  await forgetWithPhotos(sb, String(f.get("id") ?? ""));
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

export async function saveAlert(_p: SaveState, f: FormData): Promise<SaveState> {
  const sb = await serverSupabase();
  const { error } = await sb.rpc("set_person_alert", { p_person: String(f.get("person") ?? ""), p_alert: String(f.get("alert") ?? "") });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/b/${String(f.get("slug") ?? "")}/people/${String(f.get("person") ?? "")}`);
  return { ok: Date.now() };
}

export async function saveVisitNote(_p: SaveState, f: FormData): Promise<SaveState> {
  const sb = await serverSupabase();
  const { error } = await sb.rpc("set_visit_note", { p_booking: String(f.get("booking") ?? ""), p_note: String(f.get("note") ?? "") });
  if (error) return { error: errorKey(error.message) };
  return { ok: Date.now() };
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** A before/after photo (already shrunk in the browser) into the private bucket, then recorded on the client. */
export async function uploadPhoto(f: FormData): Promise<{ error?: MessageKey }> {
  const sb = await serverSupabase();
  const business = String(f.get("business") ?? ""), person = String(f.get("person") ?? ""), slug = String(f.get("slug") ?? "");
  const file = f.get("file");
  if (!(file instanceof File) || !PHOTO_TYPES[file.type]) return { error: "err.invalid_image" };
  if (file.size > 3 * 1024 * 1024) return { error: "err.image_too_big" };
  const path = `${business}/${person}/${crypto.randomUUID()}.${PHOTO_TYPES[file.type]}`;
  const { error: upErr } = await sb.storage.from("client-media").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: /row-level|security|unauthor/i.test(upErr.message) ? "err.not_allowed" : "err.generic" };
  const { error } = await sb.rpc("add_person_photo", { p_person: person, p_path: path, p_kind: String(f.get("kind") ?? "other"), p_booking: String(f.get("booking") ?? "") || null });
  if (error) { await sb.storage.from("client-media").remove([path]); return { error: errorKey(error.message) }; }
  revalidatePath(`/b/${slug}/people/${person}`);
  return {};
}

export async function removePhoto(f: FormData) {
  const sb = await serverSupabase();
  const { data: path } = await sb.rpc("remove_person_photo", { p_photo: String(f.get("photo") ?? "") });
  if (path) await sb.storage.from("client-media").remove([path as string]);
  revalidatePath(`/b/${String(f.get("slug") ?? "")}/people/${String(f.get("person") ?? "")}`);
}
