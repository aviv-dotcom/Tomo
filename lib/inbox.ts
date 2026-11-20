import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compose, type Action } from "@/lib/compose";
import type { Biz } from "@/lib/biz";
import { siteBase } from "@/lib/site";

/** Pending actions with their messages written, ready to show. */
export async function loadInbox(sb: SupabaseClient, biz: Biz, limit = 50) {
  const [{ data }, { data: page }] = await Promise.all([
    sb.rpc("list_actions", { p_business: biz.id, p_limit: limit }),
    sb.from("business_pages").select("published").eq("business_id", biz.id).maybeSingle(),
  ]);
  const base = siteBase();
  const pageUrl = page?.published && base ? `${base}/p/${biz.slug}` : null;
  // An offer for a time that has already passed is no longer useful.
  return ((data ?? []) as Action[]).filter((a) => !(a.kind === "waitlist_offer" && a.data.starts_at && new Date(a.data.starts_at) < new Date())).map((a) => ({ action: a, text: compose(a, { business: biz.name, timezone: biz.timezone, pageUrl, base }) }));
}
