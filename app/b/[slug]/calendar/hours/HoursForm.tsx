"use client";
import Link from "next/link";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { minToTime } from "@/lib/time";
import { saveCancelHours, saveHours, type FormState } from "../actions";

const t = translator("he");

/** One opening range per day. Several ranges a day are supported by the database and can come later in the UI. */
export function HoursForm({ business, slug, hours, cancelHours }: { business: string; slug: string; cancelHours: number; hours: { weekday: number; start_min: number; end_min: number }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveHours, null);
  const [pState, pAction, pPending] = useActionState<FormState, FormData>(saveCancelHours, null);
  return (
    <main className="page">
      <Link href={`/b/${slug}/calendar`} className="muted small">→ {t("back")}</Link>
      <h1 className="h1">{t("hours.title")}</h1>
      <p className="sub">{t("hours.subtitle")}</p>
      <form action={action} className="card">
        <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const h = hours.find((x) => x.weekday === d);
          return (
            <div key={d} className="hours-row">
              <label className="check"><input type="checkbox" name={`open-${d}`} defaultChecked={!!h} /> {t(`day.${d}` as MessageKey)}</label>
              <div className="hours-times">
                <input className="input input-ltr" type="time" name={`start-${d}`} defaultValue={h ? minToTime(h.start_min) : "09:00"} step={900} aria-label={`${t(`day.${d}` as MessageKey)} start`} />
                <span>–</span>
                <input className="input input-ltr" type="time" name={`end-${d}`} defaultValue={h ? minToTime(h.end_min) : "18:00"} step={900} aria-label={`${t(`day.${d}` as MessageKey)} end`} />
              </div>
            </div>
          );
        })}
        {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
        {state?.ok && !pending && <p className="muted small" role="status">✓ {t("hours.saved")}</p>}
        <button className="btn btn-primary" disabled={pending}>{pending ? t("hours.saving") : t("hours.save")}</button>
      </form>
      <form action={pAction} className="card">
        <h2 className="card-title">{t("policy.title")}</h2>
        <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
        <label className="row small">{t("policy.hours")}
          <input className="input input-ltr" type="number" name="hours" min={0} max={168} defaultValue={cancelHours} style={{ width: 80 }} aria-label={t("policy.hours")} />
          {t("policy.hours.unit")}</label>
        {pState?.error && <p className="error" role="alert">{t(pState.error)}</p>}
        {pState?.ok && !pPending && <p className="muted small" role="status">✓ {t("card.saved")}</p>}
        <button className="btn btn-secondary btn-small" disabled={pPending}>{t("policy.save")}</button>
      </form>
    </main>
  );
}
