"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";

export async function resolveAction(id: string, status: "sent" | "dismissed", slug: string): Promise<void> {
  const sb = await serverSupabase();
  await sb.rpc("resolve_action", { p_action: id, p_status: status });
  revalidatePath(`/b/${slug}`); revalidatePath(`/b/${slug}/inbox`);
}

export async function toggleAutomation(business: string, key: string, enabled: boolean, slug: string): Promise<void> {
  const sb = await serverSupabase();
  await sb.rpc("set_automation", { p_business: business, p_key: key, p_enabled: enabled });
  revalidatePath(`/b/${slug}/automations`); revalidatePath(`/b/${slug}`);
}

/** Confirms a client's request to be forgotten: removes their details, then closes the request. */
export async function forgetFromRequest(actionId: string, personId: string, slug: string): Promise<void> {
  const sb = await serverSupabase();
  const { error } = await sb.rpc("forget_person", { p_person: personId });
  if (!error) await sb.rpc("resolve_action", { p_action: actionId, p_status: "sent" }).then(() => null, () => null);
  revalidatePath(`/b/${slug}`); revalidatePath(`/b/${slug}/inbox`); revalidatePath(`/b/${slug}/people`);
}
