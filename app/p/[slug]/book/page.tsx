import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/public";
import { localDate } from "@/lib/time";
import { BookFlow } from "./BookFlow";

export const dynamic = "force-dynamic";

export default async function PublicBookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ o?: string; s?: string; w?: string; d?: string }> }) {
  const { slug } = await params;
  const { o, s, w, d } = await searchParams;
  const p = await getPublicPage(slug);
  if (!p) notFound();
  const offering = o ? p.offerings.find((x) => x.id === o && x.delivery === "appointment") : undefined;
  const session = s ? p.classes.find((x) => x.id === s && (x.left > 0 || w === "1")) : undefined;
  const today = localDate(p.timezone);
  if (!offering && !session) notFound();
  return <BookFlow slug={slug} name={p.name} timezone={p.timezone} today={today} startDay={d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today ? d : today} waitlist={!!session && session.left === 0} accent={p.accent ?? null} addons={offering ? p.addons ?? [] : []}
    providers={offering ? (p.providers ?? []).filter((x) => !x.offerings || x.offerings.includes(offering.id)) : []}
    offering={offering ? { id: offering.id, name: offering.name, minutes: offering.minutes, priceAgorot: offering.priceAgorot } : null}
    session={session ? { id: session.id, name: session.offering, starts_at: session.starts_at, location: session.location } : null} />;
}
