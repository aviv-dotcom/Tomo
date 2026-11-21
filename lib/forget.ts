import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Forgets a client: the database erases personal details; their private photo files are deleted from storage too. */
export async function forgetWithPhotos(sb: SupabaseClient, personId: string) {
  const { data: photos } = await sb.from("person_photos").select("path").eq("person_id", personId);
  const { error } = await sb.rpc("forget_person", { p_person: personId });
  if (!error && photos?.length) await sb.storage.from("client-media").remove(photos.map((p) => p.path as string));
  return { error };
}
