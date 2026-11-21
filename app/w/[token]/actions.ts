"use server";
import { revalidatePath } from "next/cache";
import { anonSupabase } from "@/lib/supabase/anon";

export async function leaveWaitlist(f: FormData) {
  const token = String(f.get("token") ?? "");
  await anonSupabase().rpc("public_leave_waitlist", { p_token: token });
  revalidatePath(`/w/${token}`);
}
