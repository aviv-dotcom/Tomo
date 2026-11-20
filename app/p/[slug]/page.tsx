import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/public";
import { PublicPageView } from "@/components/PublicPageView";
import { translator } from "@/lib/i18n";

export const dynamic = "force-dynamic";
const t = translator("he");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPublicPage((await params).slug);
  if (!p) return { title: "Tomo" };
  return { title: p.name, description: p.tagline ?? undefined, robots: { index: true, follow: true } };
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicPage(slug);
  if (!p) notFound();
  return <main className="page" style={{ paddingBottom: 40 }}><PublicPageView p={p} /></main>;
}
