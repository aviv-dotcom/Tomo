"use client";
import Link from "next/link";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { minToTime } from "@/lib/time";
import { saveHours, type FormState } from "../actions";

const t = translator("he");

/** One opening range per day. Several ranges a day are supported by the database and can come later in the UI. */
export function HoursForm({ business, slug, hours }: { business: string; slug: string; hours: { weekday: number; start_min: number; end_min: number }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveHours, null);
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
    </main>
  );
}
