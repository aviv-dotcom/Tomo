import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/biz";
import { shekels } from "@/lib/format";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate, fmtTime, localDate } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { bookingAction } from "../../actions";
import { AddToSession } from "./AddToSession";
import { CancelSession } from "./CancelSession";
import { StopSeries } from "./StopSeries";
import { Avatar, Back, Empty, Icon, Title, type IconName } from "@/components/Icon";

export const dynamic = "force-dynamic";
const t = translator("he");

type Detail = { id: string; starts_at: string; ends_at: string; capacity: number; location: string | null; status: string;
  offering: { id: string; name: string; delivery: string }; bookings: { id: string; person_id: string; name: string; status: string }[] };

export default async function SessionPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data, error } = await sb.rpc("session_detail", { p_session: id });
  if (error || !data) notFound();
  const s = data as Detail;
  const tz = biz.timezone;
  const isClass = s.capacity > 1;
  const booked = s.bookings.filter((b) => b.status !== "waitlist").length;
  const { data: rec } = await sb.from("sessions").select("recurrence_id, recurrences(active)").eq("id", s.id).maybeSingle();
  const series = (rec as { recurrence_id: string | null; recurrences: { active: boolean } | null } | null);
  const { data: people } = isClass ? await sb.rpc("list_people", { p_business: biz.id }) : { data: [] };
  const taken = new Set(s.bookings.map((b) => b.person_id));
  const { data: addonRows } = s.bookings.length ? await sb.from("booking_addons").select("booking_id, name, price_agorot").in("booking_id", s.bookings.map((b) => b.id)) : { data: [] };
  const addonsOf = (id: string) => ((addonRows ?? []) as { booking_id: string; name: string; price_agorot: number }[]).filter((a) => a.booking_id === id);
  const candidates = ((people ?? []) as { id: string; name: string; status: string }[]).filter((p) => !taken.has(p.id) && p.status !== "left");
  const op = (b: { id: string }, value: string, label: string, icon: IconName, primary = false) => (
    <form action={bookingAction}>
      <input type="hidden" name="booking" value={b.id} /><input type="hidden" name="op" value={value} />
      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="session" value={s.id} />
      <button className={`btn btn-small ${primary ? "btn-primary" : "btn-secondary"}`}><Icon n={icon} />{label}</button>
    </form>
  );
  return (
    <>
      <main className="page">
        <Back href={`/b/${slug}/calendar?d=${localDate(tz, new Date(s.starts_at))}`} label={t("cal.title")} />
        <h1 className="h1">{s.offering.name}</h1>
        <div className="row" style={{ flexWrap: "wrap", gap: 14 }}><span className="meta"><Icon n="calendar" size={16} />{fmtDate(s.starts_at, tz)}</span><span className="meta"><Icon n="clock" size={16} /><bdi dir="ltr">{fmtTime(s.starts_at, tz)}–{fmtTime(s.ends_at, tz)}</bdi></span>{s.location && <span className="meta"><Icon n="pin" size={16} />{s.location}</span>}{s.status === "cancelled" && <span className="tag tag-warn">{t("session.cancelled")}</span>}</div>
        <section className="card" style={{ gap: 0 }}>
          <Title n="users" style={{ marginBottom: 6 }} extra={isClass ? <span className="muted small">{booked}/{s.capacity}</span> : undefined}>{t("session.participants")}</Title>
          {s.bookings.length === 0 && <Empty n="users" text={t("session.empty")} />}
          {s.bookings.map((b) => (
            <div key={b.id} className="list-row" style={{ flexWrap: "wrap" }}>
              <Avatar name={b.name} size={32} /><Link href={`/b/${slug}/people/${b.person_id}`} className="grow" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>{b.name}</Link>
              <span className="tag">{t(`bstatus.${b.status}` as MessageKey)}</span>
              {addonsOf(b.id).length > 0 && <span className="muted small row" style={{ width: "100%", gap: 6 }}><Icon n="plus" size={14} />{t("session.addons")}: {addonsOf(b.id).map((a) => `${a.name} (${shekels(a.price_agorot)})`).join(", ")}</span>}
              <div className="row" style={{ width: "100%", gap: 6 }}>
                {b.status === "booked" && <>{op(b, "attended", t("session.attended"), "check", true)}{op(b, "no_show", t("session.noshow"), "ban")}</>}
                {(b.status === "attended" || b.status === "no_show") && op(b, "booked", t("session.undo"), "undo")}
                {(b.status === "booked" || b.status === "waitlist") && op(b, "cancel", t("session.cancel"), "x")}
              </div>
            </div>
          ))}
        </section>
        {isClass && s.status === "scheduled" && candidates.length > 0 && (
          <AddToSession session={s.id} slug={slug} full={booked >= s.capacity} people={candidates} />
        )}
        {s.status === "scheduled" && new Date(s.starts_at) > new Date() && (
          <CancelSession session={s.id} slug={slug} date={localDate(tz, new Date(s.starts_at))} />
        )}
        {series?.recurrence_id && series.recurrences?.active && (
          <StopSeries recurrence={series.recurrence_id} slug={slug} date={localDate(tz, new Date(s.starts_at))} />
        )}
      </main>
      <OwnerNav slug={slug} active="calendar" />
    </>
  );
}
