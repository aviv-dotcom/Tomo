import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { OfferingForm, type Offering } from "./OfferingForm";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function ServicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.from("offerings").select("id, name, delivery, billing, minutes, price_agorot, deposit_agorot, buffer_minutes, active")
    .eq("business_id", biz.id).order("active", { ascending: false }).order("position");
  const offerings = (data ?? []) as Offering[];
  return (
    <>
      <main className="page">
        <Link href={`/b/${slug}`} className="muted small">→ {t("back")}</Link>
        <h1 className="h1">{t("svc.title")}</h1>
        <p className="sub">{t("svc.subtitle")}</p>
        <section className="card" style={{ gap: 0 }}>
          {offerings.map((o) => <OfferingForm key={o.id} business={biz.id} slug={slug} offering={o} />)}
        </section>
        <OfferingForm business={biz.id} slug={slug} />
      </main>
      <OwnerNav slug={slug} active="today" />
    </>
  );
}
