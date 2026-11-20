import { requireBusiness } from "@/lib/biz";
import { HoursForm } from "./HoursForm";

export const dynamic = "force-dynamic";

export default async function HoursPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const [{ data }, { data: b }] = await Promise.all([
    sb.from("business_hours").select("weekday, start_min, end_min").eq("business_id", biz.id).order("start_min"),
    sb.from("businesses").select("cancel_hours").eq("id", biz.id).single(),
  ]);
  return <HoursForm business={biz.id} slug={slug} cancelHours={b?.cancel_hours ?? 12} hours={(data ?? []) as { weekday: number; start_min: number; end_min: number }[]} />;
}
