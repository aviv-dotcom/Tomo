import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { backTarget } from "@/lib/back";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { SiteForm } from "./SiteForm";
import { Back } from "@/components/Icon";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function SitePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ back?: string }> }) {
  const { slug } = await params;
  const ret = backTarget(slug, (await searchParams).back);
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.from("business_pages").select("published, tagline, about, whatsapp, address").eq("business_id", biz.id).maybeSingle();
  return (
    <>
      <main className="page">
        <Back href={ret.href} label={ret.label} />
        <h1 className="h1">{t("site.title")}</h1>
        <p className="sub">{t("site.subtitle")}</p>
        <SiteForm business={biz.id} slug={slug} back={ret} page={data ?? { published: false, tagline: null, about: null, whatsapp: null, address: null }} />
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
