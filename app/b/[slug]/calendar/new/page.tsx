import { requireBusiness } from "@/lib/biz";
import { addDays, isDate, localDate, weekday } from "@/lib/time";
import { NewAppointment } from "./NewAppointment";

export const dynamic = "force-dynamic";

export default async function NewAppointmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string; person?: string }> }) {
  const { slug } = await params;
  const { d, person } = await searchParams;
  const { sb, biz } = await requireBusiness(slug);
  const [{ data: offerings }, { data: people }, { data: hoursRows }] = await Promise.all([
    sb.from("offerings").select("id, name, minutes, delivery, price_agorot").eq("business_id", biz.id).in("delivery", ["appointment", "addon", "product"]).eq("active", true).order("position"),
    sb.rpc("list_people", { p_business: biz.id }),
    sb.from("business_hours").select("weekday").eq("business_id", biz.id),
  ]);
  const all = (offerings ?? []) as { id: string; name: string; minutes: number | null; delivery: string; price_agorot: number }[];
  const today = localDate(biz.timezone);
  const openDays = [...new Set(((hoursRows ?? []) as { weekday: number }[]).map((h) => h.weekday))];
  let start = isDate(d) && d >= today ? d : today;
  if (!d && openDays.length) for (let i = 0; i < 7 && !openDays.includes(weekday(start)); i++) start = addDays(start, 1);
  return <NewAppointment biz={biz} slug={slug} today={today} hasHours={openDays.length > 0} openDays={openDays} date={start} person={person ?? ""}
    offerings={all.filter((o) => o.delivery === "appointment")}
    addons={all.filter((o) => o.delivery !== "appointment").map((o) => ({ id: o.id, name: o.name, delivery: o.delivery, minutes: o.minutes, priceAgorot: o.price_agorot }))}
    people={((people ?? []) as { id: string; name: string; status: string }[]).filter((p) => p.status !== "left")} />;
}
