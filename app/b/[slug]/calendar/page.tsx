import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { addDays, dayNum, fmtTime, isDate, localDate, weekday } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { WaitlistCard, type WaitEntry } from "@/components/WaitlistCard";
import { Empty, Icon, IconTile } from "@/components/Icon";

export const dynamic = "force-dynamic";
const t = translator("he");

type Item = { id: string; starts_at: string; ends_at: string; capacity: number; location: string | null; offering: string; delivery: string;
  recurring: boolean; booked: number; waitlist: number; people: string[]; provider: { id: string; name: string; color: string } | null };

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string; p?: string }> }) {
  const { slug } = await params;
  const { d, p: who } = await searchParams;
  const { sb, biz, isOwner } = await requireBusiness(slug);
  const today = localDate(biz.timezone);
  const day = isDate(d) ? d : today;
  const start = addDays(day, -weekday(day));
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  // The whole week: a list for the chosen day on phones, seven columns on a wide screen.
  const [agendas, { data: waitData }, { data: hoursRows }] = await Promise.all([
    Promise.all(week.map((w) => sb.rpc("day_agenda", { p_business: biz.id, p_date: w }).then((r) => (r.data ?? []) as Item[]))),
    sb.rpc("list_waitlist", { p_business: biz.id }),
    sb.from("business_hours").select("weekday").eq("business_id", biz.id),
  ]);
  const { data: provData } = await sb.rpc("list_providers", { p_business: biz.id });
  const providers = ((provData ?? []) as { id: string; name: string; color: string; active: boolean }[]).filter((x) => x.active);
  // Filtering by one person keeps shared sessions (classes) that block everyone.
  const shown = (list: Item[]) => who ? list.filter((s) => !s.provider || s.provider.id === who) : list;
  const q = (extra: Record<string, string>) => `/b/${slug}/calendar?${new URLSearchParams({ ...(who ? { p: who } : {}), ...extra })}`;
  const items = shown(agendas[week.indexOf(day)] ?? []);
  const openDays = new Set(((hoursRows ?? []) as { weekday: number }[]).map((h) => h.weekday));
  return (
    <>
      <main className="page page-cal">
        <div className="top"><h1 className="h1">{t("cal.title")}</h1>
          {day !== today && <Link className="chip" href={`/b/${slug}/calendar`}>{t("cal.today")}</Link>}</div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link className="chip" href={q({ d: addDays(start, -7) })} aria-label={t("cal.prev")}><Icon n="back" size={16} /></Link>
          <span className="muted small">{t(`day.${weekday(day)}` as MessageKey)} {dayNum(day)}.{Number(day.slice(5, 7))}</span>
          <Link className="chip" href={q({ d: addDays(start, 7) })} aria-label={t("cal.next")}><Icon n="chev" size={16} /></Link>
        </div>
        <div className="day-list">
        <div className="days">
          {week.map((w) => (
            <Link key={w} href={q({ d: w })} className={`day ${w === day ? "day-on" : ""}`} aria-current={w === day ? "date" : undefined}>
              {t(`dayShort.${weekday(w)}` as MessageKey)}<b>{dayNum(w)}</b>
            </Link>
          ))}
        </div>
        </div>
        {providers.length > 0 && (
          <div className="chips" role="group" aria-label={t("prov.title")}>
            <Link className={`chip ${!who ? "chip-on" : ""}`} href={`/b/${slug}/calendar?d=${day}`}>{t("prov.all")}</Link>
            {providers.map((x) => <Link key={x.id} className={`chip ${who === x.id ? "chip-on" : ""}`} href={`/b/${slug}/calendar?d=${day}&p=${x.id}`}><span className="dot-color" style={{ background: x.color }} />{x.name}</Link>)}
          </div>
        )}
        <div className="row">
          <Link className="btn btn-primary btn-small" style={{ flex: 1 }} href={`/b/${slug}/calendar/new?d=${day}`}><Icon n="calendarPlus" />{t("cal.new_appt")}</Link>
          {isOwner && <Link className="btn btn-secondary btn-small" style={{ flex: 1 }} href={`/b/${slug}/calendar/class`}><Icon n="repeat" />{t("cal.new_class")}</Link>}
        </div>
        <div className="week" aria-label={t("cal.week")}>
          {week.map((w, i) => (
            <div key={w} className="week-col">
              <Link href={q({ d: w })} className={`week-head ${w === day ? "on" : ""} ${openDays.size && !openDays.has(weekday(w)) ? "closed" : ""}`} aria-current={w === today ? "date" : undefined}>
                {t(`day.${weekday(w)}` as MessageKey)}<b>{dayNum(w)}.{Number(w.slice(5, 7))}</b>
              </Link>
              {shown(agendas[i]).length === 0 && <span className="week-empty">{w === today ? t("cal.today") : "·"}</span>}
              {shown(agendas[i]).map((s) => (
                <Link key={s.id} href={`/b/${slug}/calendar/s/${s.id}`} className={`week-item ${s.capacity > 1 ? "class-item" : ""}`} style={s.provider ? { borderInlineStartColor: s.provider.color } : undefined}>
                  <b>{fmtTime(s.starts_at, biz.timezone)}</b>
                  <span>{s.offering}</span>
                  <span className="muted">{s.capacity > 1 ? `${s.booked}/${s.capacity}` : s.people[0] ?? ""}{s.provider && !who ? ` · ${s.provider.name}` : ""}</span>
                </Link>
              ))}
              {w >= today && <Link className="week-add" href={`/b/${slug}/calendar/new?d=${w}`} aria-label={`${t("cal.new_appt")} ${dayNum(w)}.${Number(w.slice(5, 7))}`}><Icon n="plus" size={16} /></Link>}
            </div>
          ))}
        </div>
        <div className="day-list">
        {items.length === 0 && <div className="card"><Empty n="sun" text={t("cal.empty")} /></div>}
        {items.map((s) => (
          <Link key={s.id} href={`/b/${slug}/calendar/s/${s.id}`} className="session" style={s.provider ? { borderInlineStartColor: s.provider.color } : undefined}>
            <span className="session-time">{fmtTime(s.starts_at, biz.timezone)}</span>
            <IconTile n={s.capacity > 1 ? "users" : "user"} size={32} />
            <span className="grow">
              <b>{s.offering}{s.capacity === 1 && s.people[0] ? ` · ${s.people[0]}` : ""}</b>
              <span className="muted small">
                {[s.capacity > 1 ? `${s.booked}/${s.capacity} ${t("cal.places")}` : null, s.waitlist ? `${s.waitlist} ${t("cal.waitlist")}` : null,
                  s.provider?.name, s.location, s.recurring ? t("cal.recurring") : null].filter(Boolean).join(" · ")}
              </span>
            </span>
          </Link>
        ))}
        </div>
        <WaitlistCard slug={slug} timezone={biz.timezone} entries={(waitData ?? []) as WaitEntry[]} date={day} />
      </main>
      <OwnerNav slug={slug} active="calendar" />
    </>
  );
}
