import { type NextRequest } from "next/server";
import { getManaged } from "@/lib/manage";
import { ics } from "@/lib/ics";
import { siteBase } from "@/lib/site";

/** The client's booking as a calendar file (opens straight into Apple Calendar on an iPhone). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Not found", { status: 404 });
  const b = await getManaged(token);
  if (!b || b.status === "cancelled") return new Response("Not found", { status: 404 });
  const end = new Date(new Date(b.starts_at).getTime() + (b.offering.minutes ?? 60) * 60000).toISOString();
  const base = siteBase();
  const body = ics([{ uid: `${token}@tomo`, start: b.starts_at, end, title: `${b.offering.name} · ${b.business.name}`, location: b.location,
    description: base ? `${base}/m/${token}` : undefined, url: base ? `${base}/m/${token}` : undefined }]);
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="booking.ics"', "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
