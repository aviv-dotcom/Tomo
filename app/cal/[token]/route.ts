import { type NextRequest } from "next/server";
import { anonSupabase } from "@/lib/supabase/anon";
import { ics, type IcsEvent } from "@/lib/ics";
import { siteBase } from "@/lib/site";
import { translator } from "@/lib/i18n";

const t = translator("he");
type Feed = { name: string; slug: string; timezone: string;
  sessions: { id: string; starts_at: string; ends_at: string; location: string | null; capacity: number; offering: string; booked: number; first_names: string[]; addons: string[]; updated: string }[];
  time_off: { id: string; starts_at: string; ends_at: string; note: string | null }[] };

/** The owner's calendar subscription: /cal/<private token>.ics */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Not found", { status: 404 });
  const { data } = await anonSupabase().rpc("public_calendar_feed", { p_token: token });
  if (!data) return new Response("Not found", { status: 404 });
  const f = data as Feed;
  const base = siteBase();
  const events: IcsEvent[] = f.sessions.map((s): IcsEvent => {
    const who = s.capacity > 1 ? `(${s.booked}/${s.capacity})` : s.first_names[0] ?? "";
    return {
      uid: `${s.id}@tomo`, start: s.starts_at, end: s.ends_at, location: s.location, stamp: s.updated,
      title: [s.offering, s.addons.length ? `+ ${s.addons.join(" + ")}` : "", who].filter(Boolean).join(" "),
      description: s.capacity > 1 && s.first_names.length ? s.first_names.join(", ") : undefined,
      url: base ? `${base}/b/${f.slug}/calendar/s/${s.id}` : undefined,
    };
  }).concat(f.time_off.map((o): IcsEvent => ({ uid: `off-${o.id}@tomo`, start: o.starts_at, end: o.ends_at, title: `${t("off.title")}${o.note ? `: ${o.note}` : ""}` })));
  return new Response(ics(events, { name: `${f.name} · Tomo`, refreshHours: 1 }), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" },
  });
}
