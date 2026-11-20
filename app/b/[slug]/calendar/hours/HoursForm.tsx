"use client";
import { startTransition, useActionState, useState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { minToTime, timeToMin } from "@/lib/time";
import { saveHours, type FormState } from "../actions";
import { TimeSelect } from "@/components/TimeSelect";
import { Back, Icon } from "@/components/Icon";

const t = translator("he");
type Day = { open: boolean; start: string; end: string };

/** One opening range per day, each with a clear open/closed switch. A new business starts with Sun–Thu 09:00–18:00. */
export function HoursForm({ business, slug, hours }: { business: string; slug: string; hours: { weekday: number; start_min: number; end_min: number }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveHours, null);
  const fresh = hours.length === 0;
  const [days, setDays] = useState<Day[]>(() => [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const h = hours.find((x) => x.weekday === d);
    return h ? { open: true, start: minToTime(h.start_min), end: minToTime(h.end_min) } : { open: fresh && d <= 4, start: "09:00", end: d === 5 ? "14:00" : "18:00" };
  }));
  const set = (d: number, patch: Partial<Day>) => setDays((all) => all.map((x, i) => (i === d ? { ...x, ...patch } : x)));
  const first = days.find((x) => x.open);
  const copyToAll = () => first && setDays((all) => all.map((x) => (x.open ? { ...x, start: first.start, end: first.end } : x)));
  const bad = days.some((x) => x.open && timeToMin(x.end) <= timeToMin(x.start));
  const openCount = days.filter((x) => x.open).length;

  return (
    <main className="page">
      <Back href={`/b/${slug}/settings`} label={t("set.title")} />
      <h1 className="h1">{t("hours.title")}</h1>
      <p className="sub">{t("hours.subtitle")}</p>
      <form className="card" style={{ gap: 0 }}
        onSubmit={(e) => {
          // Submitted by hand so React does not reset the form after saving (the switches would look off again).
          e.preventDefault();
          if (openCount === 0 && !confirm(t("hours.none.confirm"))) return;
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}>
        <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
        {fresh && !state?.ok && <p className="small row" style={{ margin: "0 0 8px", background: "var(--accent-soft)", padding: 10, borderRadius: 10, alignItems: "start" }}><Icon n="info" size={16} /><span>{t("hours.suggested")}</span></p>}
        {days.map((x, d) => (
          <div key={d} className="list-row hours-day">
            {x.open && <input type="hidden" name={`open-${d}`} value="on" />}
            <label className="hours-toggle">
              <input type="checkbox" className="switch" checked={x.open} onChange={(e) => set(d, { open: e.target.checked })} aria-label={`${t(`day.${d}` as MessageKey)} ${t("hours.open")}`} />
              <span className={x.open ? undefined : "muted"} style={{ fontWeight: x.open ? 600 : 400 }}>{t(`day.${d}` as MessageKey)}</span>
            </label>
            {x.open ? (
              <div className="hours-times" dir="ltr">
                <TimeSelect name={`start-${d}`} value={x.start} onChange={(v) => set(d, { start: v })} from={5 * 60} to={23 * 60} label={`${t(`day.${d}` as MessageKey)} ${t("off.from")}`} />
                <span>–</span>
                <TimeSelect name={`end-${d}`} value={x.end} onChange={(v) => set(d, { end: v })} from={6 * 60} to={24 * 60} label={`${t(`day.${d}` as MessageKey)} ${t("off.to")}`} />
              </div>
            ) : <span className="muted small">{t("hours.closed")}</span>}
          </div>
        ))}
        {openCount > 1 && <button type="button" className="link-btn small" style={{ alignSelf: "start", padding: 0, marginTop: 6 }} onClick={copyToAll}><Icon n="copy" size={14} style={{ marginInlineEnd: 6 }} />{t("hours.copy")}</button>}
        {bad && <p className="error" role="alert" style={{ marginTop: 8 }}>{t("hours.bad")}</p>}
        {state?.error && <p className="error" role="alert" style={{ marginTop: 8 }}>{t(state.error)}</p>}
        {state?.ok && !pending && <p className="muted small" role="status" style={{ marginTop: 8 }}><Icon n="check" size={15} />{t("hours.saved")} · {openCount ? t("hours.summary").replace("{n}", String(openCount)) : t("hours.allclosed")}</p>}
        <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={pending || bad}><Icon n="check" />{pending ? t("hours.saving") : t("hours.save")}</button>
      </form>
    </main>
  );
}
