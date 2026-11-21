"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import { savedUrl } from "@/lib/back";
import type { MessageKey } from "@/lib/i18n/messages";

export type SiteState = { error?: MessageKey; ok?: number } | null;
export type MediaResult = { path?: string; error?: MessageKey };

/** Accepts a handle, @handle or a full profile link and keeps only the handle. */
function handle(v: string, host: RegExp): string {
  let s = v.trim();
  if (!s) return "";
  try { if (/^https?:\/\//i.test(s) || host.test(s)) { const u = new URL(/^https?:/i.test(s) ? s : `https://${s}`); s = u.pathname.split("/").filter(Boolean)[0] ?? ""; } } catch { /* keep as typed */ }
  return s.replace(/^@/, "");
}

export async function saveSite(_p: SiteState, f: FormData): Promise<SiteState> {
  const s = (k: string) => String(f.get(k) ?? "");
  const sb = await serverSupabase();
  const { error } = await sb.rpc("save_page", {
    p_business: s("business"), p_published: f.get("published") === "on", p_tagline: s("tagline"),
    p_about: s("about"), p_whatsapp: s("whatsapp"), p_address: s("address"),
  });
  if (error) return { error: /whatsapp_check/.test(error.message) ? "err.invalid_phone" : errorKey(error.message) };
  let website = s("website").trim();
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  let sections: unknown = [];
  try { sections = JSON.parse(s("sections") || "[]"); } catch { /* validated by the database */ }
  const { error: dErr } = await sb.rpc("save_page_design", {
    p_business: s("business"), p_accent: s("accent"),
    p_instagram: handle(s("instagram"), /instagram\.com/i), p_facebook: handle(s("facebook"), /facebook\.com|fb\.com/i),
    p_tiktok: handle(s("tiktok"), /tiktok\.com/i), p_website: website, p_sections: sections,
  });
  if (dErr) return { error: /instagram_check|facebook_check|tiktok_check|website_check/.test(dErr.message) ? "err.invalid_social" : errorKey(dErr.message) };
  const { error: fErr } = await sb.rpc("set_page_fonts", { p_business: s("business"), p_heading: s("font_heading"), p_body: s("font_body"), p_size: s("text_size") });
  if (fErr) return { error: errorKey(fErr.message) };
  revalidatePath(`/b/${s("slug")}`, "layout"); revalidatePath(`/p/${s("slug")}`);
  redirect(savedUrl(s("slug"), s("back"), "site"));
}

const KINDS = ["logo", "cover", "gallery_add"] as const;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Uploads one image for the page (already shrunk in the browser) and puts it in place. Saved at once. */
export async function uploadMedia(f: FormData): Promise<MediaResult> {
  const business = String(f.get("business") ?? ""), slug = String(f.get("slug") ?? "");
  const kind = KINDS.find((k) => k === f.get("kind"));
  const file = f.get("file");
  if (!kind || !(file instanceof File) || !TYPES[file.type]) return { error: "err.invalid_image" };
  if (file.size > 3 * 1024 * 1024) return { error: "err.image_too_big" };
  const sb = await serverSupabase();
  const path = `${business}/${kind === "gallery_add" ? "gallery" : kind}-${crypto.randomUUID()}.${TYPES[file.type]}`;
  const { error: upErr } = await sb.storage.from("page-media").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (upErr) return { error: /row-level|security|unauthor/i.test(upErr.message) ? "err.not_owner" : "err.generic" };
  const { data: old, error } = await sb.rpc("set_page_media", { p_business: business, p_kind: kind, p_path: path });
  if (error) { await sb.storage.from("page-media").remove([path]); return { error: errorKey(error.message) }; }
  if (old) await sb.storage.from("page-media").remove([old as string]);
  revalidatePath(`/p/${slug}`);
  return { path };
}

export async function removeMedia(business: string, slug: string, kind: "logo_remove" | "cover_remove" | "gallery_remove", path: string | null): Promise<MediaResult> {
  const sb = await serverSupabase();
  const { data: old, error } = await sb.rpc("set_page_media", { p_business: business, p_kind: kind, p_path: path });
  if (error) return { error: errorKey(error.message) };
  if (old) await sb.storage.from("page-media").remove([old as string]);
  revalidatePath(`/p/${slug}`);
  return {};
}
