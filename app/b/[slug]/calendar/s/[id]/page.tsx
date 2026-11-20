import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate, fmtTime, localDate } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { bookingAction } from "../../actions";
import { AddToSession } from "./AddToSession";
import { CancelSession } from "./CancelSession";
import { StopSeries } from "./StopSeries";

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
  const candidates = ((people ?? []) as { id: string; name: string; status: string }[]).filter((p) => !taken.has(p.id) && p.status !== "left");
  const op = (b: { id: string }, value: string, label: string, primary = false) => (
    <form action={bookingAction}>
      <input type="hidden" name="booking" value={b.id} /><input type="hidden" name="op" value={value} />
      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="session" value={s.id} />
      <button className={`btn btn-small ${primary ? "btn-primary" : "btn-secondary"}`}>{label}</button>
    </form>
  );
  return (
    <>
      <main className="page">
        <Link href={`/b/${slug}/calendar?d=${localDate(tz, new Date(s.starts_at))}`} className="muted small">→ {t("back")}</Link>
        <h1 className="h1">{s.offering.name}</h1>
        <p className="sub">{fmtDate(s.starts_at, tz)} · <bdi dir="ltr">{fmtTime(s.starts_at, tz)}–{fmtTime(s.ends_at, tz)}</bdi>{s.location ? ` · ${s.location}` : ""}</p>
        <section className="card" style={{ gap: 0 }}>
          <h2 className="card-title" style={{ marginBottom: 6 }}>{t("session.participants")}{isClass && <span className="muted small">{booked}/{s.capacity}</span>}</h2>
          {s.bookings.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("session.empty")}</p>}
          {s.bookings.map((b) => (
            <div key={b.id} className="list-row" style={{ flexWrap: "wrap" }}>
              <Link href={`/b/${slug}/people/${b.person_id}`} className="grow" style={{ color: "inherit" }}>{b.name}</Link>
              <span className="tag">{t(`bstatus.${b.status}` as MessageKey)}</span>
              <div className="row" style={{ width: "100%", gap: 6 }}>
                {b.status === "booked" && <>{op(b, "attended", t("session.attended"), true)}{op(b, "no_show", t("session.noshow"))}</>}
                {(b.status === "attended" || b.status === "no_show") && op(b, "booked", t("session.undo"))}
                {(b.status === "booked" || b.status === "waitlist") && op(b, "cancel", t("session.cancel"))}
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
