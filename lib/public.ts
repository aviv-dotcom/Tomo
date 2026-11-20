import "server-only";
import { cache } from "react";
import { anonSupabase } from "@/lib/supabase/anon";

export type PublicPage = {
  name: string; slug: string; timezone: string; vocabulary: Record<string, string>;
  tagline: string | null; about: string | null; whatsapp: string | null; address: string | null;
  offerings: { id: string; name: string; delivery: string; billing: string; minutes: number | null; priceAgorot: number }[];
  classes: { id: string; offering_id: string; offering: string; starts_at: string; location: string | null; left: number }[];
};

/** The published page, or null. Cached per request so metadata and the page share one call. */
export const getPublicPage = cache(async (slug: string): Promise<PublicPage | null> => {
  const { data } = await anonSupabase().rpc("public_page", { p_slug: slug });
  return (data as PublicPage | null) ?? null;
});

/** wa.me wants the international number without + or leading zero. */
export function whatsappLink(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("0") ? "972" + d.slice(1) : d}`;
}
