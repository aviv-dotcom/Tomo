import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VisitPhoto } from "@/components/VisitForms";

/** Before / after photos of some visits, as links that expire in 10 minutes (the files are private). */
export async function visitPhotos(sb: SupabaseClient, bookings: string[]): Promise<(booking: string) => VisitPhoto[]> {
  if (!bookings.length) return () => [];
  const { data } = await sb.from("person_photos").select("id, path, kind, booking_id, created_at").in("booking_id", bookings).order("created_at");
  const rows = (data ?? []) as { id: string; path: string; kind: string; booking_id: string }[];
  const { data: signed } = rows.length ? await sb.storage.from("client-media").createSignedUrls(rows.map((r) => r.path), 600) : { data: [] };
  const url = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  return (booking) => rows.filter((r) => r.booking_id === booking).map((r) => ({ id: r.id, kind: r.kind, url: url.get(r.path) ?? null }));
}

/** The business's visit-card switches (Settings) and the products it can recommend. */
export async function visitSetup(sb: SupabaseClient, business: string) {
  const [{ data: b }, { data: prods }] = await Promise.all([
    sb.from("businesses").select("modules").eq("id", business).single(),
    sb.from("offerings").select("id, name, price_agorot").eq("business_id", business).eq("active", true).eq("delivery", "product").order("position"),
  ]);
  const modules = new Set((b?.modules ?? []) as string[]);
  return {
    summary: modules.has("visit_summary"), withPhotos: modules.has("before_after"), withRecs: modules.has("recommendations"),
    productOptions: ((prods ?? []) as { id: string; name: string; price_agorot: number }[]).map((o) => ({ id: o.id, name: o.name, priceAgorot: o.price_agorot })),
  };
}
