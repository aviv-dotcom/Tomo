"use server";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type TeamState = { error?: MessageKey; token?: string } | null;

export async function inviteMember(_p: TeamState, f: FormData): Promise<TeamState> {
  const sb = await serverSupabase();
  const { data, error } = await sb.rpc("invite_member", { p_business: String(f.get("business") ?? ""), p_email: String(f.get("email") ?? ""), p_role: "manager" });
  if (error) return { error: /invites_email_check/.test(error.message) ? "login.error" : errorKey(error.message) };
  revalidatePath(`/b/${String(f.get("slug") ?? "")}/team`);
  return { token: data as string };
}

export async function removeMember(f: FormData) {
  const sb = await serverSupabase();
  await sb.rpc("remove_member", { p_business: String(f.get("business") ?? ""), p_user: String(f.get("user") ?? "") });
  revalidatePath(`/b/${String(f.get("slug") ?? "")}/team`);
}

export async function revokeInvite(f: FormData) {
  const sb = await serverSupabase();
  await sb.rpc("revoke_invite", { p_invite: String(f.get("invite") ?? "") });
  revalidatePath(`/b/${String(f.get("slug") ?? "")}/team`);
}
