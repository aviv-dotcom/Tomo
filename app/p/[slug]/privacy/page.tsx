import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/public";
import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-dynamic";

export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicPage(slug);
  if (!p) notFound();
  return <LegalPage title="legal.privacy" back={{ href: `/p/${slug}`, label: p.name }} intro="priv.intro" vars={{ business: p.name }} footer="priv.contact"
    sections={[
      { title: "priv.what.title", body: "priv.what.body" }, { title: "priv.why.title", body: "priv.why.body" },
      { title: "priv.rights.title", body: "priv.rights.body" }, { title: "priv.security.title", body: "priv.security.body" },
    ]} />;
}
