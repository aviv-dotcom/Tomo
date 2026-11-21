import { requireBusiness } from "@/lib/biz";
import { OwnerNav } from "@/components/OwnerNav";
import { backTarget } from "@/lib/back";
import { HoursForm } from "./HoursForm";
import { OwnerOnly } from "@/components/OwnerOnly";

export const dynamic = "force-dynamic";

export default async function HoursPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ back?: string }> }) {
  const { slug } = await params;
  const { back } = await searchParams;
  const { sb, biz, isOwner } = await requireBusiness(slug);
  if (!isOwner) return <OwnerOnly slug={slug} title="hours.title" />;
  const { data } = await sb.from("business_hours").select("weekday, start_min, end_min").eq("business_id", biz.id).order("start_min");
  const ret = backTarget(slug, back);
  return (
    <>
      <HoursForm business={biz.id} slug={slug} back={ret} hours={(data ?? []) as { weekday: number; start_min: number; end_min: number }[]} />
      <OwnerNav slug={slug} active={back === "today" ? "today" : back === "appt" ? "calendar" : "more"} />
    </>
  );
}
