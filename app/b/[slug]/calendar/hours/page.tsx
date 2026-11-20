import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { HoursForm } from "./HoursForm";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function HoursPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ back?: string }> }) {
  const { slug } = await params;
  const { back } = await searchParams;
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.from("business_hours").select("weekday, start_min, end_min").eq("business_id", biz.id).order("start_min");
  // Where "done" returns to: the screen that sent the owner here.
  const ret = back === "today" ? { href: `/b/${slug}`, label: t("nav.today"), place: t("hours.place.home") }
    : back === "appt" ? { href: `/b/${slug}/calendar/new`, label: t("appt.title"), place: t("hours.place.appt") }
    : { href: `/b/${slug}/settings`, label: t("set.title"), place: t("hours.place.settings") };
  return (
    <>
      <HoursForm business={biz.id} slug={slug} back={ret} hours={(data ?? []) as { weekday: number; start_min: number; end_min: number }[]} />
      <OwnerNav slug={slug} active={back === "today" ? "today" : back === "appt" ? "calendar" : "more"} />
    </>
  );
}
