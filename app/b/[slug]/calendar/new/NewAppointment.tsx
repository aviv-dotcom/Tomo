"use client";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { addDays, dayNum, fmtTime, weekday } from "@/lib/time";
import { TimeSelect } from "@/components/TimeSelect";
import { DateSelect } from "@/components/DateSelect";
import { bookAppointment, getSlots, type FormState } from "../actions";
import type { Addon } from "@/components/PublicPageView";
import { shekels } from "@/lib/format";
import { Back, Icon } from "@/components/Icon";

const t = translator("he");
type Props = { biz: { id: string; timezone: string }; slug: string; date: string; today: string; hasHours: boolean; openDays: number[]; initialOffering: string; person: string;
  offerings: { id: string; name: string; minutes: number | null }[]; addons: Addon[]; people: { id: string; name: string }[] };

export function NewAppointment({ biz, slug, date: initialDate, today, hasHours, openDays, initialOffering, person, offerings, addons, people }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(bookAppointment, null);
  const [offering, setOffering] = useState(offerings.some((o) => o.id === initialOffering) ? initialOffering : offerings[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState("");
  const [other, setOther] = useState(false);
  const [loading, startLoading] = useTransition();
  const strip = Array.from({ length: 28 }, (_, i) => addDays(today, i));
  const [picker, setPicker] = useState(!strip.includes(initialDate));

  useEffect(() => {
    if (!offering || !date) return;
    setSlot("");
    startLoading(async () => setSlots(await getSlots(biz.id, offering, date, picked)));
  }, [biz.id, offering, date, picked]);

  return (
    <main className="page">
      <Back href={`/b/${slug}/calendar?d=${date}`} label={t("cal.title")} />
      <h1 className="h1">{t("appt.title")}</h1>
      {offerings.length === 0 ? <p className="muted">{t("appt.no_services")}</p> : people.length === 0 ? <p className="muted">{t("appt.no_people")}</p> : (
        <form action={action} className="card" style={{ gap: 14 }}>
          <input type="hidden" name="business" value={biz.id} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="slot" value={slot} />
          {picked.map((id) => <input key={id} type="hidden" name="addon" value={id} />)}
          <label className="field"><span className="label">{t("appt.service")}</span>
            <select className="input" name="offering" value={offering} onChange={(e) => setOffering(e.target.value)}>
              {offerings.map((o) => <option key={o.id} value={o.id}>{o.name}{o.minutes ? ` · ${o.minutes} ${t("minutes")}` : ""}</option>)}
            </select></label>
          {addons.length > 0 && (
            <div className="field"><span className="label">{t("appt.addons")}</span>
              {addons.map((a) => (
                <label key={a.id} className={`addon ${picked.includes(a.id) ? "addon-on" : ""}`}>
                  <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id))} />
                  <span className="grow"><span>{a.name}</span>{a.delivery === "addon" && a.minutes ? <span className="muted small">+{a.minutes} {t("minutes")}</span> : null}</span>
                  <span className="price">+{shekels(a.priceAgorot)}</span>
                </label>
              ))}
            </div>
          )}
          <label className="field"><span className="label">{t("appt.person")}</span>
            <select className="input" name="person" defaultValue={person} required>
              <option value="" disabled>{t("appt.person.choose")}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <div className="field"><span className="label">{t("appt.date")}</span>
            <input type="hidden" name="date" value={date} />
            {picker ? <DateSelect from={today} value={date} onChange={setDate} label={t("appt.date")} /> : (
              <div className="days-scroll">
                {strip.map((d) => (
                  <button type="button" key={d} className={`day ${d === date ? "day-on" : ""} ${hasHours && !openDays.includes(weekday(d)) ? "day-closed" : ""}`} aria-pressed={d === date} onClick={() => setDate(d)}>
                    {t(`dayShort.${weekday(d)}` as MessageKey)}<b>{dayNum(d)}</b>{dayNum(d) === 1 || d === today ? <span>{Number(d.slice(5, 7))}/</span> : null}
                  </button>))}
              </div>)}
            {!picker && <button type="button" className="link-btn small" style={{ alignSelf: "start", minHeight: 32, padding: 0 }} onClick={() => setPicker(true)}>{t("appt.later")}</button>}
          </div>
          {!other && (
            <div className="field"><span className="label">{t("appt.slots")}</span>
              {loading || slots === null ? <span className="muted">…</span> : slots.length === 0 ? (hasHours ? <span className="muted small">{t("appt.noslots")}</span> : (
                <div className="action"><span className="small row"><Icon n="clock" size={16} />{t("appt.nohours")}</span>
                  <Link className="btn btn-primary btn-small" href={`/b/${slug}/calendar/hours?back=appt`}><Icon n="clock" />{t("today.setup.hours")}</Link></div>)) : (
                <div className="slot-grid">
                  {slots.map((s) => <button type="button" key={s} className={`slot ${slot === s ? "slot-on" : ""}`} aria-pressed={slot === s} onClick={() => setSlot(s)}>{fmtTime(s, biz.timezone)}</button>)}
                </div>)}
            </div>)}
          <label className="check"><input type="checkbox" name="other" checked={other} onChange={(e) => setOther(e.target.checked)} /> {t("appt.other")}</label>
          {other && <label className="field"><span className="label">{t("appt.time")}</span><TimeSelect name="time" defaultValue="10:00" from={6 * 60} to={23 * 60} step={5} label={t("appt.time")} /></label>}
          {state?.error && <p className="error" role="alert">{t(state.error as MessageKey)}</p>}
          <button className="btn btn-primary" disabled={pending || (!other && !slot)}><Icon n="calendarPlus" />{pending ? t("appt.booking") : t("appt.book")}</button>
        </form>
      )}
    </main>
  );
}
