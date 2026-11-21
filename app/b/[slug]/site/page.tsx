import { requireBusiness } from "@/lib/biz";
import { backTarget } from "@/lib/back";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { Back } from "@/components/Icon";
import type { PageData } from "@/components/PublicPageView";
import { SiteEditor } from "./SiteEditor";
import { OwnerOnly } from "@/components/OwnerOnly";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function SitePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ back?: string }> }) {
  const { slug } = await params;
  const ret = backTarget(slug, (await searchParams).back);
  const { sb, biz, isOwner } = await requireBusiness(slug);
  if (!isOwner) return <OwnerOnly slug={slug} title="site.title" />;
  const [{ data: pg }, { data: offerings }, { data: hours }, { data: sessions }] = await Promise.all([
    sb.from("business_pages").select("*").eq("business_id", biz.id).maybeSingle(),
    sb.from("offerings").select("id, name, delivery, billing, minutes, price_agorot").eq("business_id", biz.id).eq("active", true)
      .in("delivery", ["appointment", "class", "membership", "product"]).order("position"),
    sb.from("business_hours").select("weekday, start_min, end_min").eq("business_id", biz.id).order("weekday"),
    sb.from("sessions").select("id, offering_id, starts_at, location, capacity, offerings(name)").eq("business_id", biz.id).eq("status", "scheduled")
      .gt("capacity", 1).gt("starts_at", new Date().toISOString()).lt("starts_at", new Date(Date.now() + 14 * 864e5).toISOString()).order("starts_at").limit(20),
  ]);
  // The same shape the public page gets, built from the owner's own data (the page may not be published yet).
  const base: PageData = {
    name: biz.name, slug, timezone: biz.timezone,
    tagline: pg?.tagline ?? null, about: pg?.about ?? null, whatsapp: pg?.whatsapp ?? null, address: pg?.address ?? null,
    accent: pg?.accent ?? null, logo: pg?.logo_path ?? null, cover: pg?.cover_path ?? null, gallery: (pg?.gallery ?? []) as string[],
    instagram: pg?.instagram ?? null, facebook: pg?.facebook ?? null, tiktok: pg?.tiktok ?? null, website: pg?.website ?? null,
    sections: (pg?.sections ?? null) as string[] | null,
    hours: ((hours ?? []) as { weekday: number; start_min: number; end_min: number }[]).map((h) => ({ weekday: h.weekday, start: h.start_min, end: h.end_min })),
    offerings: ((offerings ?? []) as { id: string; name: string; delivery: string; billing: string; minutes: number | null; price_agorot: number }[])
      .map((o) => ({ id: o.id, name: o.name, delivery: o.delivery, billing: o.billing, minutes: o.minutes, priceAgorot: o.price_agorot })),
    classes: ((sessions ?? []) as unknown as { id: string; offering_id: string; starts_at: string; location: string | null; capacity: number; offerings: { name: string } | null }[])
      .map((s) => ({ id: s.id, offering_id: s.offering_id, offering: s.offerings?.name ?? "", starts_at: s.starts_at, location: s.location, left: s.capacity })),
  };
  return (
    <>
      <main className="page page-wide">
        <Back href={ret.href} label={ret.label} />
        <h1 className="h1">{t("site.title")}</h1>
        <p className="sub">{t("site.subtitle")}</p>
        <SiteEditor business={biz.id} slug={slug} back={ret} published={!!pg?.published} base={base} />
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
