"use client";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { addDays, dayNum, fmtDate, fmtTime, weekday } from "@/lib/time";
import { publicBook, publicSlots, publicWaitlist, type BookState, type WaitState } from "./actions";
import { Back, Icon, Title } from "@/components/Icon";
import type { Addon } from "@/components/PublicPageView";
import { shekels } from "@/lib/format";

const t = translator("he");
type Props = { slug: string; name: string; timezone: string; today: string; startDay: string; waitlist: boolean; accent: string | null; addons: Addon[];
  offering: { id: string; name: string; minutes: number | null; priceAgorot: number } | null;
  session: { id: string; name: string; starts_at: string; location: string | null } | null };

export function BookFlow({ slug, name, timezone, today, startDay, waitlist, accent, addons, offering, session }: Props) {
  const [state, action, pending] = useActionState<BookState, FormData>(publicBook, null);
  const [wState, wAction, wPending] = useActionState<WaitState, FormData>(publicWaitlist, null);
  const [wait, setWait] = useState(waitlist);
  const [part, setPart] = useState("any");
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const [day, setDay] = useState(startDay);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState("");
  const [loading, start] = useTransition();
  const [picked, setPicked] = useState<string[]>([]);
  const chosen = addons.filter((a) => picked.includes(a.id));
  const total = (offering?.priceAgorot ?? 0) + chosen.reduce((n, a) => n + a.priceAgorot, 0);
  const minutes = (offering?.minutes ?? 0) + chosen.reduce((n, a) => n + (a.delivery === "addon" ? a.minutes ?? 0 : 0), 0);
  const style = accent ? ({ "--accent": accent, "--accent-soft": `color-mix(in srgb, ${accent} 13%, var(--surface))` } as React.CSSProperties) : undefined;

  useEffect(() => {
    if (!offering) return;
    setSlot("");
    start(async () => setSlots(await publicSlots(slug, offering.id, day, picked)));
  }, [slug, offering, day, picked]);

  if (wState?.done) {
    const when = wState.done.starts_at ? `${fmtDate(wState.done.starts_at, timezone)} · ${fmtTime(wState.done.starts_at, timezone)}`
      : `${wState.done.date ? fmtDate(`${wState.done.date}T12:00:00Z`, timezone) : ""} · ${t(`part.${wState.done.part ?? "any"}` as MessageKey)}`;
    return (
      <main className="page" style={{ paddingTop: 48, ...style }}>
        <span className="hero-mark" aria-hidden="true"><Icon n="clock" size={32} /></span>
        <h1 className="h1">{t("wait.done.title")}</h1>
        <div className="card"><b>{wState.done.offering}</b><span className="meta"><Icon n="calendar" size={15} />{when}</span><span className="muted">{name}</span></div>
        <p className="sub">{t("wait.done.body")}</p>
        <Link className="btn btn-secondary" href={`/p/${slug}`}>{t("pubbook.done.back")}</Link>
      </main>
    );
  }

  if (state?.done) {
    return (
      <main className="page" style={{ paddingTop: 48, ...style }}>
        <span className="hero-mark" style={{ background: "var(--good)" }} aria-hidden="true"><Icon n="check" size={32} /></span>
        <h1 className="h1">{t("pubbook.done.title")}</h1>
        <div className="card">
          <b>{state.done.offering}</b>
          <span className="meta"><Icon n="calendar" size={15} />{fmtDate(state.done.starts_at, timezone)} · {fmtTime(state.done.starts_at, timezone)}</span>{state.done.location && <span className="meta"><Icon n="pin" size={15} />{state.done.location}</span>}
          {!!state.done.addons?.length && <span className="meta"><Icon n="plus" size={15} />{state.done.addons.join(", ")}</span>}
          <span className="muted">{name}</span>
        </div>
        <p className="sub">{t("pubbook.done.body")}</p>
        <Link className="btn btn-secondary" href={`/p/${slug}`}>{t("pubbook.done.back")}</Link>
      </main>
    );
  }

  return (
    <main className="page" style={{ paddingBottom: 40, ...style }}>
      <Back href={`/p/${slug}`} label={name} />
      <h1 className="h1">{wait ? t("wait.title") : offering ? t("pubbook.title") : t("pubbook.join.title")}</h1>
      {wait && <p className="sub">{session ? t("wait.class.sub") : t("wait.sub")}</p>}
      <div className="card"><b className="title-in"><Icon n={offering ? "user" : "users"} className="title-icon" />{offering?.name ?? session?.name}</b>
        {session && <span className="muted">{fmtDate(session.starts_at, timezone)} · {fmtTime(session.starts_at, timezone)}{session.location ? ` · ${session.location}` : ""}</span>}
        {offering?.minutes && <span className="muted small">{offering.minutes} {t("minutes")}</span>}
      </div>

      {offering && !wait && addons.length > 0 && (
        <section className="card" style={{ gap: 8 }}>
          <Title n="plus">{t("pubbook.addons")}</Title>
          {addons.map((a) => (
            <label key={a.id} className={`addon ${picked.includes(a.id) ? "addon-on" : ""}`}>
              <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id))} />
              <span className="grow"><b>{a.name}</b>{a.delivery === "addon" && a.minutes ? <span className="muted small">+{a.minutes} {t("minutes")}</span> : null}</span>
              <span className="price">+{shekels(a.priceAgorot)}</span>
            </label>
          ))}
        </section>
      )}

      {offering && (
        <section className="card">
          <Title n="calendar">{t("pubbook.day")}</Title>
          <div className="days days-scroll">
            {days.map((d) => (
              <button type="button" key={d} className={`day ${d === day ? "day-on" : ""}`} aria-pressed={d === day} onClick={() => setDay(d)}>
                {t(`dayShort.${weekday(d)}` as MessageKey)}<b>{dayNum(d)}</b>
              </button>
            ))}
          </div>
          {wait ? (
            <>
              <Title n="clock">{t("wait.part")}</Title>
              <div className="chips" role="radiogroup" aria-label={t("wait.part")}>
                {(["any", "morning", "afternoon", "evening"] as const).map((x) => (
                  <button key={x} type="button" role="radio" aria-checked={part === x} className={`chip ${part === x ? "chip-on" : ""}`} onClick={() => setPart(x)}>{t(`part.${x}` as MessageKey)}</button>
                ))}
              </div>
              <button type="button" className="link-btn small" style={{ alignSelf: "start", padding: 0 }} onClick={() => setWait(false)}>{t("wait.back")}</button>
            </>
          ) : (
            <>
          <Title n="clock">{t("pubbook.time")}</Title>
            {loading || slots === null ? <span className="muted">…</span> : slots.length === 0 ? <span className="muted small">{t("pubbook.notimes")}</span> : (
              <div className="slot-grid">
                {slots.map((s) => <button type="button" key={s} className={`slot ${slot === s ? "slot-on" : ""}`} aria-pressed={slot === s} onClick={() => setSlot(s)}>{fmtTime(s, timezone)}</button>)}
              </div>
            )}
              <button type="button" className="wait-link" onClick={() => setWait(true)}><Icon n="clock" size={16} />{t("wait.link")}</button>
            </>
          )}
        </section>
      )}

      <form action={wait ? wAction : action} className="card" style={{ gap: 12 }}>
        {wait && offering && <><input type="hidden" name="date" value={day} /><input type="hidden" name="part" value={part} /></>}
        <Title n="user">{t("pubbook.details")}</Title>
        <input type="hidden" name="slug" value={slug} />
        {offering && <><input type="hidden" name="offering" value={offering.id} /><input type="hidden" name="slot" value={slot} /></>}
        {picked.map((id) => <input key={id} type="hidden" name="addon" value={id} />)}
        {session && <input type="hidden" name="session" value={session.id} />}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp" />
        <label className="field"><span className="label">{t("pubbook.name")}</span><input className="input" name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>
        <label className="field"><span className="label">{t("pubbook.phone")}</span><input className="input input-ltr" name="phone" type="tel" required inputMode="tel" autoComplete="tel" /></label>
        <label className="field"><span className="label">{t("pubbook.email")}</span><input className="input input-ltr" name="email" type="email" autoComplete="email" /></label>
        <label className="check"><input type="checkbox" name="marketing" /> {t("pubbook.marketing")}</label>
        {!wait && state?.error && <p className="error" role="alert">{t(state.error)}</p>}
        {wait && wState?.error && <p className="error" role="alert">{t(wState.error)}</p>}
        {offering && !wait && (
          <div className="summary">
            <span className="grow"><b>{[offering.name, ...chosen.map((c) => c.name)].join(" + ")}</b>
              <span className="muted small">{minutes ? `${minutes} ${t("minutes")}` : ""}{slot ? ` · ${fmtDate(slot, timezone)} ${fmtTime(slot, timezone)}` : ""}</span></span>
            <span className="price">{shekels(total)}</span>
          </div>
        )}
        <button className="btn btn-primary" disabled={wait ? wPending : pending || (!!offering && !slot)}>
          {wait ? (wPending ? t("pubbook.sending") : t("wait.submit")) : pending ? t("pubbook.sending") : offering ? t("pubbook.submit") : t("pubbook.submit.join")}
        </button>
        <p className="muted small row" style={{ margin: 0 }}><Icon n="shield" size={15} />{t("pubbook.privacy")}</p>
      </form>
    </main>
  );
}
