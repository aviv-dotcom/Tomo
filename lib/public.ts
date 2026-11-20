import "server-only";
import { cache } from "react";
import { anonSupabase } from "@/lib/supabase/anon";
import type { PageData } from "@/components/PublicPageView";

export type PublicPage = PageData;

/** The published page, or null. Cached per request so metadata and the page share one call. */
export const getPublicPage = cache(async (slug: string): Promise<PublicPage | null> => {
  const { data } = await anonSupabase().rpc("public_page", { p_slug: slug });
  return (data as PublicPage | null) ?? null;
});

export { whatsappLink } from "@/lib/format";
