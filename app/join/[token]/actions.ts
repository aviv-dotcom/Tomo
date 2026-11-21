"use server";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/messages";

export type JoinState = { error?: MessageKey } | null;

export async function acceptInvite(_p: JoinState, f: FormData): Promise<JoinState> {
  const sb = await serverSupabase();
  const { data, error } = await sb.rpc("accept_invite", { p_token: String(f.get("token") ?? "") });
  if (error) return { error: errorKey(error.message) };
  redirect(`/b/${data}`);
}
