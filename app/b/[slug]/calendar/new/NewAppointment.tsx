"use client";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtTime } from "@/lib/time";
import { bookAppointment, getSlots, type FormState } from "../actions";

const t = translator("he");
type Props = { biz: { id: string; timezone: string }; slug: string; date: string; person: string;
  offerings: { id: string; name: string; minutes: number | null }[]; people: { id: string; name: string }[] };

export function NewAppointment({ biz, slug, date: initialDate, person, offerings, people }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(bookAppointment, null);
  const [offering, setOffering] = useState(offerings[0]?.id ?? "");
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState("");
  const [other, setOther] = useState(false);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    if (!offering || !date) return;
    setSlot("");
    startLoading(async () => setSlots(await getSlots(biz.id, offering, date)));
  }, [biz.id, offering, date]);

  return (
    <main className="page">
      <Link href={`/b/${slug}/calendar?d=${date}`} className="muted small">→ {t("back")}</Link>
      <h1 className="h1">{t("appt.title")}</h1>
      {offerings.length === 0 ? <p className="muted">{t("appt.no_services")}</p> : people.length === 0 ? <p className="muted">{t("appt.no_people")}</p> : (
        <form action={action} className="card" style={{ gap: 14 }}>
          <input type="hidden" name="business" value={biz.id} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="slot" value={slot} />
          <label className="field"><span className="label">{t("appt.service")}</span>
            <select className="input" name="offering" value={offering} onChange={(e) => setOffering(e.target.value)}>
              {offerings.map((o) => <option key={o.id} value={o.id}>{o.name}{o.minutes ? ` · ${o.minutes} ${t("minutes")}` : ""}</option>)}
            </select></label>
          <label className="field"><span className="label">{t("appt.person")}</span>
            <select className="input" name="person" defaultValue={person} required>
              <option value="" disabled>{t("appt.person.choose")}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className="field"><span className="label">{t("appt.date")}</span>
            <input className="input input-ltr" type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          {!other && (
            <div className="field"><span className="label">{t("appt.slots")}</span>
              {loading || slots === null ? <span className="muted">…</span> : slots.length === 0 ? <span className="muted small">{t("appt.noslots")}</span> : (
                <div className="slot-grid">
                  {slots.map((s) => <button type="button" key={s} className={`slot ${slot === s ? "slot-on" : ""}`} aria-pressed={slot === s} onClick={() => setSlot(s)}>{fmtTime(s, biz.timezone)}</button>)}
                </div>)}
            </div>)}
          <label className="check"><input type="checkbox" name="other" checked={other} onChange={(e) => setOther(e.target.checked)} /> {t("appt.other")}</label>
          {other && <label className="field"><span className="label">{t("appt.time")}</span><input className="input input-ltr" type="time" name="time" step={300} required /></label>}
          {state?.error && <p className="error" role="alert">{t(state.error as MessageKey)}</p>}
          <button className="btn btn-primary" disabled={pending || (!other && !slot)}>{pending ? t("appt.booking") : t("appt.book")}</button>
        </form>
      )}
    </main>
  );
}
