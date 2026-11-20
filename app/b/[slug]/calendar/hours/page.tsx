import { requireBusiness } from "@/lib/biz";
import { HoursForm } from "./HoursForm";

export const dynamic = "force-dynamic";

export default async function HoursPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.from("business_hours").select("weekday, start_min, end_min").eq("business_id", biz.id).order("start_min");
  return <HoursForm business={biz.id} slug={slug} hours={(data ?? []) as { weekday: number; start_min: number; end_min: number }[]} />;
}
