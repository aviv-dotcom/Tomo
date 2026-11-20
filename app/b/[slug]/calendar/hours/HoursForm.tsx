"use client";
import Link from "next/link";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { minToTime } from "@/lib/time";
import { saveHours, type FormState } from "../actions";
import { TimeSelect } from "@/components/TimeSelect";
import { Back, Icon } from "@/components/Icon";

const t = translator("he");

/** One opening range per day. Several ranges a day are supported by the database and can come later in the UI. */
export function HoursForm({ business, slug, hours }: { business: string; slug: string; hours: { weekday: number; start_min: number; end_min: number }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveHours, null);
  return (
    <main className="page">
      <Back href={`/b/${slug}/settings`} label={t("set.title")} />
      <h1 className="h1">{t("hours.title")}</h1>
      <p className="sub">{t("hours.subtitle")}</p>
      <form action={action} className="card" onSubmit={(e) => { if (!e.currentTarget.querySelector("input[type=checkbox]:checked") && !confirm(t("hours.none.confirm"))) e.preventDefault(); }}>
        {hours.length === 0 && <p className="small row" style={{ margin: 0, background: "var(--accent-soft)", padding: 10, borderRadius: 10 }}><Icon n="info" size={16} />{t("hours.suggested")}</p>}
        <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const h = hours.find((x) => x.weekday === d);
          return (
            <div key={d} className="hours-row">
              <label className="check"><input type="checkbox" name={`open-${d}`} defaultChecked={hours.length ? !!h : d <= 4} /> {t(`day.${d}` as MessageKey)}</label>
              <div className="hours-times">
                <TimeSelect name={`start-${d}`} defaultValue={h ? minToTime(h.start_min) : "09:00"} from={5 * 60} to={23 * 60} label={`${t(`day.${d}` as MessageKey)} ${t("off.from")}`} />
                <span>–</span>
                <TimeSelect name={`end-${d}`} defaultValue={h ? minToTime(h.end_min) : "18:00"} from={6 * 60} to={24 * 60} label={`${t(`day.${d}` as MessageKey)} ${t("off.to")}`} />
              </div>
            </div>
          );
        })}
        {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
        {state?.ok && !pending && <p className="muted small" role="status"><Icon n="check" size={15} />{t("hours.saved")}</p>}
        <button className="btn btn-primary" disabled={pending}><Icon n="check" />{pending ? t("hours.saving") : t("hours.save")}</button>
      </form>
    </main>
  );
}
