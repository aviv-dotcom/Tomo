import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/public";
import { translator } from "@/lib/i18n";
import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function AccessibilityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicPage(slug);
  if (!p) notFound();
  return <LegalPage title="legal.accessibility" back={{ href: `/p/${slug}`, label: p.name }} intro="a11y.intro" vars={{ business: p.name, phone: p.whatsapp ?? "", address: p.address ?? "" }}
    sections={[
      { title: "a11y.done.title", items: ["a11y.done.1", "a11y.done.2", "a11y.done.3", "a11y.done.4", "a11y.done.5", "a11y.done.6"] },
      { title: "a11y.limits.title", body: "a11y.limits.body" },
      { title: "a11y.contact.title", body: "a11y.contact.body", extra: (
        <ul style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.8 }}>
          {p.whatsapp && <li>{t("a11y.contact.whatsapp").replace("{phone}", p.whatsapp)}</li>}
          {p.address && <li>{t("a11y.contact.address").replace("{address}", p.address)}</li>}
        </ul>) },
    ]} />;
}
