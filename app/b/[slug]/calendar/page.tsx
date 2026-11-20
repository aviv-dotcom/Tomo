import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { addDays, dayNum, fmtTime, isDate, localDate, weekday } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";

export const dynamic = "force-dynamic";
const t = translator("he");

type Item = { id: string; starts_at: string; ends_at: string; capacity: number; location: string | null; offering: string; delivery: string;
  recurring: boolean; booked: number; waitlist: number; people: string[] };

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string }> }) {
  const { slug } = await params;
  const { d } = await searchParams;
  const { sb, biz } = await requireBusiness(slug);
  const today = localDate(biz.timezone);
  const day = isDate(d) ? d : today;
  const { data } = await sb.rpc("day_agenda", { p_business: biz.id, p_date: day });
  const items = (data ?? []) as Item[];
  const start = addDays(day, -weekday(day));
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <>
      <main className="page">
        <div className="top"><h1 className="h1">{t("cal.title")}</h1>
          {day !== today && <Link className="chip" href={`/b/${slug}/calendar`}>{t("cal.today")}</Link>}</div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link className="chip" href={`/b/${slug}/calendar?d=${addDays(start, -7)}`} aria-label="שבוע קודם">→</Link>
          <span className="muted small">{t(`day.${weekday(day)}` as MessageKey)} {dayNum(day)}.{Number(day.slice(5, 7))}</span>
          <Link className="chip" href={`/b/${slug}/calendar?d=${addDays(start, 7)}`} aria-label="שבוע הבא">←</Link>
        </div>
        <div className="days">
          {week.map((w) => (
            <Link key={w} href={`/b/${slug}/calendar?d=${w}`} className={`day ${w === day ? "day-on" : ""}`} aria-current={w === day ? "date" : undefined}>
              {t(`dayShort.${weekday(w)}` as MessageKey)}<b>{dayNum(w)}</b>
            </Link>
          ))}
        </div>
        <div className="chips">
          <Link className="btn btn-primary btn-small" href={`/b/${slug}/calendar/new?d=${day}`}>{t("cal.new_appt")}</Link>
          <Link className="btn btn-secondary btn-small" href={`/b/${slug}/calendar/class`}>{t("cal.new_class")}</Link>
          <Link className="btn btn-secondary btn-small" href={`/b/${slug}/calendar/hours`}>{t("cal.hours")}</Link>
          <Link className="btn btn-secondary btn-small" href={`/b/${slug}/calendar/off`}>{t("cal.off")}</Link>
        </div>
        {items.length === 0 && <p className="muted">{t("cal.empty")}</p>}
        {items.map((s) => (
          <Link key={s.id} href={`/b/${slug}/calendar/s/${s.id}`} className="session">
            <span className="session-time">{fmtTime(s.starts_at, biz.timezone)}</span>
            <span className="grow">
              <b>{s.offering}{s.capacity === 1 && s.people[0] ? ` · ${s.people[0]}` : ""}</b>
              <span className="muted small">
                {[s.capacity > 1 ? `${s.booked}/${s.capacity} ${t("cal.places")}` : null, s.waitlist ? `${s.waitlist} ${t("cal.waitlist")}` : null,
                  s.location, s.recurring ? t("cal.recurring") : null].filter(Boolean).join(" · ")}
              </span>
            </span>
          </Link>
        ))}
      </main>
      <OwnerNav slug={slug} active="calendar" />
    </>
  );
}
