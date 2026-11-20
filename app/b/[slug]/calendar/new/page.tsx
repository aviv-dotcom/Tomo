import { requireBusiness } from "@/lib/biz";
import { isDate, localDate } from "@/lib/time";
import { NewAppointment } from "./NewAppointment";

export const dynamic = "force-dynamic";

export default async function NewAppointmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string; person?: string }> }) {
  const { slug } = await params;
  const { d, person } = await searchParams;
  const { sb, biz } = await requireBusiness(slug);
  const [{ data: offerings }, { data: people }] = await Promise.all([
    sb.from("offerings").select("id, name, minutes").eq("business_id", biz.id).eq("delivery", "appointment").eq("active", true).order("position"),
    sb.rpc("list_people", { p_business: biz.id }),
  ]);
  return <NewAppointment biz={biz} slug={slug} date={isDate(d) ? d : localDate(biz.timezone)} person={person ?? ""}
    offerings={(offerings ?? []) as { id: string; name: string; minutes: number | null }[]}
    people={((people ?? []) as { id: string; name: string; status: string }[]).filter((p) => p.status !== "left")} />;
}
