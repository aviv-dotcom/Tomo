import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/public";
import { localDate } from "@/lib/time";
import { BookFlow } from "./BookFlow";

export const dynamic = "force-dynamic";

export default async function PublicBookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ o?: string; s?: string }> }) {
  const { slug } = await params;
  const { o, s } = await searchParams;
  const p = await getPublicPage(slug);
  if (!p) notFound();
  const offering = o ? p.offerings.find((x) => x.id === o && x.delivery === "appointment") : undefined;
  const session = s ? p.classes.find((x) => x.id === s && x.left > 0) : undefined;
  if (!offering && !session) notFound();
  return <BookFlow slug={slug} name={p.name} timezone={p.timezone} today={localDate(p.timezone)}
    offering={offering ? { id: offering.id, name: offering.name, minutes: offering.minutes } : null}
    session={session ? { id: session.id, name: session.offering, starts_at: session.starts_at, location: session.location } : null} />;
}
