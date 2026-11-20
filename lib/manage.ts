import "server-only";
import { cache } from "react";
import { anonSupabase } from "@/lib/supabase/anon";

export type ManagedBooking = {
  business: { name: string; slug: string; timezone: string; whatsapp: string | null; page: boolean };
  offering: { id: string; name: string; delivery: string; minutes: number | null };
  starts_at: string; location: string | null; status: string; cancelled_by: string | null; session_status: string;
  cancel_hours: number; can_change: boolean; first_name: string;
};

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export const getManaged = cache(async (token: string): Promise<ManagedBooking | null> => {
  if (!isUuid(token)) return null;
  const { data } = await anonSupabase().rpc("public_booking", { p_token: token });
  return (data as ManagedBooking | null) ?? null;
});

export const getForm = cache(async (token: string) => {
  if (!isUuid(token)) return null;
  const { data } = await anonSupabase().rpc("public_form", { p_token: token });
  return data as { enabled: boolean; questions?: string[]; signed?: boolean; business?: string } | null;
});
