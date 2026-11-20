"use client";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { addDays, dayNum, fmtDate, fmtTime, weekday } from "@/lib/time";
import { clientAlternatives, clientMove, type MState } from "../actions";

const t = translator("he");
type ClassAlt = { id: string; starts_at: string; location: string | null; left: number };

export function MoveFlow({ token, name, delivery, timezone, today }: { token: string; name: string; delivery: string; timezone: string; today: string }) {
  const [state, action, pending] = useActionState<MState, FormData>(clientMove, null);
  const appointment = delivery === "appointment";
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const [day, setDay] = useState(today);
  const [options, setOptions] = useState<unknown[] | null>(null);
  const [pick, setPick] = useState("");
  const [loading, start] = useTransition();
  useEffect(() => { setPick(""); start(async () => setOptions(await clientAlternatives(token, appointment ? day : null))); }, [token, appointment, day]);
  return (
    <main className="page" style={{ paddingBottom: 40 }}>
      <Link href={`/m/${token}`} className="muted small">→ {t("back")}</Link>
      <h1 className="h1">{t("move.title")}</h1>
      <div className="card"><b>{name}</b></div>
      <section className="card">
        <h2 className="card-title">{t("move.pick")}</h2>
        {appointment && (
          <div className="days days-scroll">
            {days.map((d) => (
              <button type="button" key={d} className={`day ${d === day ? "day-on" : ""}`} aria-pressed={d === day} onClick={() => setDay(d)}>
                {t(`dayShort.${weekday(d)}` as MessageKey)}<b>{dayNum(d)}</b></button>
            ))}
          </div>
        )}
        {loading || options === null ? <span className="muted">…</span> : options.length === 0 ? <span className="muted small">{t("move.none")}</span> : appointment ? (
          <div className="slot-grid">
            {(options as string[]).map((s) => <button type="button" key={s} className={`slot ${pick === s ? "slot-on" : ""}`} aria-pressed={pick === s} onClick={() => setPick(s)}>{fmtTime(s, timezone)}</button>)}
          </div>
        ) : (
          <div>
            {(options as ClassAlt[]).map((c) => (
              <button type="button" key={c.id} className={`list-row slot ${pick === c.id ? "slot-on" : ""}`} style={{ width: "100%", marginBottom: 6, padding: "8px 12px" }} aria-pressed={pick === c.id} onClick={() => setPick(c.id)}>
                <span className="grow" style={{ textAlign: "start" }}>{fmtDate(c.starts_at, timezone)} · {fmtTime(c.starts_at, timezone)}{c.location ? ` · ${c.location}` : ""}</span>
                <span className="muted small">{c.left} {t("pub.left")}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name={appointment ? "slot" : "session"} value={pick} />
        {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={!pick || pending}>{pending ? t("move.saving") : t("move.save")}</button>
      </form>
    </main>
  );
}
