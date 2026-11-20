import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let anon: SupabaseClient | null = null;

/** A client with no user, for public pages. It can only call the functions granted to anonymous visitors. */
export function anonSupabase(): SupabaseClient {
  if (!anon) anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  return anon;
}
