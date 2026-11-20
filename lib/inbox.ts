import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compose, type Action } from "@/lib/compose";
import type { Biz } from "@/lib/biz";

/** Pending actions with their messages written, ready to show. */
export async function loadInbox(sb: SupabaseClient, biz: Biz, limit = 50) {
  const [{ data }, { data: page }] = await Promise.all([
    sb.rpc("list_actions", { p_business: biz.id, p_limit: limit }),
    sb.from("business_pages").select("published").eq("business_id", biz.id).maybeSingle(),
  ]);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const pageUrl = page?.published && base ? `${base}/p/${biz.slug}` : null;
  return ((data ?? []) as Action[]).map((a) => ({ action: a, text: compose(a, { business: biz.name, timezone: biz.timezone, pageUrl }) }));
}
