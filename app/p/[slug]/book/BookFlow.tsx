"use client";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { addDays, dayNum, fmtDate, fmtTime, weekday } from "@/lib/time";
import { publicBook, publicSlots, type BookState } from "./actions";

const t = translator("he");
type Props = { slug: string; name: string; timezone: string; today: string;
  offering: { id: string; name: string; minutes: number | null } | null;
  session: { id: string; name: string; starts_at: string; location: string | null } | null };

export function BookFlow({ slug, name, timezone, today, offering, session }: Props) {
  const [state, action, pending] = useActionState<BookState, FormData>(publicBook, null);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const [day, setDay] = useState(today);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState("");
  const [loading, start] = useTransition();

  useEffect(() => {
    if (!offering) return;
    setSlot("");
    start(async () => setSlots(await publicSlots(slug, offering.id, day)));
  }, [slug, offering, day]);

  if (state?.done) {
    return (
      <main className="page" style={{ paddingTop: 48 }}>
        <span className="hero-mark" aria-hidden="true">✓</span>
        <h1 className="h1">{t("pubbook.done.title")}</h1>
        <div className="card">
          <b>{state.done.offering}</b>
          <span>{fmtDate(state.done.starts_at, timezone)} · {fmtTime(state.done.starts_at, timezone)}{state.done.location ? ` · ${state.done.location}` : ""}</span>
          <span className="muted">{name}</span>
        </div>
        <p className="sub">{t("pubbook.done.body")}</p>
        <Link className="btn btn-secondary" href={`/p/${slug}`}>{t("pubbook.done.back")}</Link>
      </main>
    );
  }

  return (
    <main className="page" style={{ paddingBottom: 40 }}>
      <Link href={`/p/${slug}`} className="muted small">→ {name}</Link>
      <h1 className="h1">{offering ? t("pubbook.title") : t("pubbook.join.title")}</h1>
      <div className="card"><b>{offering?.name ?? session?.name}</b>
        {session && <span className="muted">{fmtDate(session.starts_at, timezone)} · {fmtTime(session.starts_at, timezone)}{session.location ? ` · ${session.location}` : ""}</span>}
        {offering?.minutes && <span className="muted small">{offering.minutes} {t("minutes")}</span>}
      </div>

      {offering && (
        <section className="card">
          <h2 className="card-title">{t("pubbook.day")}</h2>
          <div className="days days-scroll">
            {days.map((d) => (
              <button type="button" key={d} className={`day ${d === day ? "day-on" : ""}`} aria-pressed={d === day} onClick={() => setDay(d)}>
                {t(`dayShort.${weekday(d)}` as MessageKey)}<b>{dayNum(d)}</b>
              </button>
            ))}
          </div>
          <h2 className="card-title">{t("pubbook.time")}</h2>
          {loading || slots === null ? <span className="muted">…</span> : slots.length === 0 ? <span className="muted small">{t("pubbook.notimes")}</span> : (
            <div className="slot-grid">
              {slots.map((s) => <button type="button" key={s} className={`slot ${slot === s ? "slot-on" : ""}`} aria-pressed={slot === s} onClick={() => setSlot(s)}>{fmtTime(s, timezone)}</button>)}
            </div>
          )}
        </section>
      )}

      <form action={action} className="card" style={{ gap: 12 }}>
        <h2 className="card-title">{t("pubbook.details")}</h2>
        <input type="hidden" name="slug" value={slug} />
        {offering && <><input type="hidden" name="offering" value={offering.id} /><input type="hidden" name="slot" value={slot} /></>}
        {session && <input type="hidden" name="session" value={session.id} />}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1 }} />
        <label className="field"><span className="label">{t("pubbook.name")}</span><input className="input" name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>
        <label className="field"><span className="label">{t("pubbook.phone")}</span><input className="input input-ltr" name="phone" type="tel" required inputMode="tel" autoComplete="tel" /></label>
        <label className="field"><span className="label">{t("pubbook.email")}</span><input className="input input-ltr" name="email" type="email" autoComplete="email" /></label>
        <label className="check"><input type="checkbox" name="marketing" /> {t("pubbook.marketing")}</label>
        {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
        <button className="btn btn-primary" disabled={pending || (!!offering && !slot)}>
          {pending ? t("pubbook.sending") : offering ? t("pubbook.submit") : t("pubbook.submit.join")}
        </button>
        <p className="muted small" style={{ margin: 0 }}>{t("pubbook.privacy")}</p>
      </form>
    </main>
  );
}
