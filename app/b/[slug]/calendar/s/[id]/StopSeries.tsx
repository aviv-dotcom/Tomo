"use client";
import { useActionState, useState } from "react";
import { translator } from "@/lib/i18n";
import { stopSeries, type FormState } from "../../actions";

const t = translator("he");

export function StopSeries({ recurrence, slug, date }: { recurrence: string; slug: string; date: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(stopSeries, null);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="link-btn small" style={{ color: "var(--bad)", alignSelf: "start", padding: 0 }} onClick={() => setOpen(true)}>{t("series.stop")}</button>;
  return (
    <form action={action} className="card" onSubmit={(e) => { if (!confirm(t("series.stop.confirm"))) e.preventDefault(); }}>
      <h2 className="card-title">{t("series.stop")}</h2>
      <p className="muted small" style={{ margin: 0 }}>{t("series.stop.hint")}</p>
      <input type="hidden" name="recurrence" value={recurrence} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="date" value={date} />
      <input className="input" name="reason" maxLength={120} placeholder={t("cancel.reason")} aria-label={t("cancel.reason")} />
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <div className="row">
        <button className="btn btn-primary btn-small" style={{ background: "var(--bad)" }} disabled={pending}>{t("series.stop.button")}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>{t("svc.cancel")}</button>
      </div>
    </form>
  );
}
