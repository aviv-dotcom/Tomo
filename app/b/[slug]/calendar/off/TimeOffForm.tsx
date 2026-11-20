"use client";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import { addTimeOff, type FormState } from "../actions";

const t = translator("he");

export function TimeOffForm({ business, slug, today }: { business: string; slug: string; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addTimeOff, null);
  return (
    <form action={action} className="card">
      <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
      <div className="kpis">
        <label className="field"><span className="label">{t("off.from")}</span><input className="input input-ltr" type="date" name="from" min={today} required /></label>
        <label className="field"><span className="label">{t("off.to")}</span><input className="input input-ltr" type="date" name="to" min={today} required /></label>
      </div>
      <input className="input" name="note" maxLength={80} placeholder={t("off.note")} aria-label={t("off.note")} />
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <button className="btn btn-primary btn-small" disabled={pending}>{pending ? t("off.adding") : t("off.add")}</button>
    </form>
  );
}
