"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import { timeToMin } from "@/lib/time";
import type { MessageKey } from "@/lib/i18n/messages";

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type ProviderState = { error?: MessageKey; ok?: number } | null;

export async function saveProvider(_p: ProviderState, f: FormData): Promise<ProviderState> {
  const sb = await serverSupabase();
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const offerings = f.get("all_services") === "on" ? null : f.getAll("offering").map(String);
  const hours = f.get("own_hours") === "on"
    ? [0, 1, 2, 3, 4, 5, 6].filter((d) => f.get(`open-${d}`) === "on").map((d) => ({ weekday: d, start: timeToMin(s(`start-${d}`)), end: timeToMin(s(`end-${d}`)) }))
    : null;
  if (offerings && offerings.length === 0) return { error: "err.provider_services" };
  const { data: id, error } = await sb.rpc("save_provider", { p_business: s("business"), p_id: s("id") || null, p_name: s("name"), p_color: s("color"),
    p_active: f.get("active") !== "off", p_offerings: offerings, p_hours: hours });
  if (error) return { error: /color_check/.test(error.message) ? "err.generic" : errorKey(error.message) };
  const { error: bioErr } = await sb.rpc("set_provider_bio", { p_provider: id, p_bio: s("bio") });
  if (bioErr) return { error: errorKey(bioErr.message) };
  // Profile photo: a new one replaces the old file; "remove" clears it.
  const file = f.get("photo");
  let path: string | null | undefined;
  if (file instanceof File && file.size > 0) {
    if (!PHOTO_TYPES[file.type]) return { error: "err.invalid_image" };
    if (file.size > 3 * 1024 * 1024) return { error: "err.image_too_big" };
    path = `${s("business")}/provider-${crypto.randomUUID()}.${PHOTO_TYPES[file.type]}`;
    const { error: upErr } = await sb.storage.from("page-media").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (upErr) return { error: /row-level|security|unauthor/i.test(upErr.message) ? "err.not_owner" : "err.generic" };
  } else if (f.get("remove_photo") === "1") path = null;
  if (path !== undefined) {
    const { data: old, error: phErr } = await sb.rpc("set_provider_photo", { p_provider: id, p_path: path });
    if (phErr) { if (path) await sb.storage.from("page-media").remove([path]); return { error: errorKey(phErr.message) }; }
    if (old) await sb.storage.from("page-media").remove([old as string]);
  }
  revalidatePath(`/b/${s("slug")}/providers`); revalidatePath(`/p/${s("slug")}`, "layout");
  return { ok: Date.now() };
}
