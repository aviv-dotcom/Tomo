import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { SiteForm } from "./SiteForm";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.from("business_pages").select("published, tagline, about, whatsapp, address").eq("business_id", biz.id).maybeSingle();
  return (
    <>
      <main className="page">
        <Link href={`/b/${slug}/settings`} className="muted small">→ {t("set.title")}</Link>
        <h1 className="h1">{t("site.title")}</h1>
        <p className="sub">{t("site.subtitle")}</p>
        <SiteForm business={biz.id} slug={slug} page={data ?? { published: false, tagline: null, about: null, whatsapp: null, address: null }} />
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
