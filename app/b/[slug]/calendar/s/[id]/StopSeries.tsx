"use client";
import { useActionState, useState } from "react";
import { translator } from "@/lib/i18n";
import { stopSeries, type FormState } from "../../actions";
import { Icon, Title } from "@/components/Icon";

const t = translator("he");

export function StopSeries({ recurrence, slug, date }: { recurrence: string; slug: string; date: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(stopSeries, null);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="link-btn small" style={{ color: "var(--bad)", alignSelf: "start", padding: 0 }} onClick={() => setOpen(true)}><Icon n="repeat" size={15} style={{ marginInlineEnd: 6 }} />{t("series.stop")}</button>;
  return (
    <form action={action} className="card" onSubmit={(e) => { if (!confirm(t("series.stop.confirm"))) e.preventDefault(); }}>
      <Title n="repeat">{t("series.stop")}</Title>
      <p className="muted small" style={{ margin: 0 }}>{t("series.stop.hint")}</p>
      <input type="hidden" name="recurrence" value={recurrence} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="date" value={date} />
      <input className="input" name="reason" maxLength={120} placeholder={t("cancel.reason")} aria-label={t("cancel.reason")} />
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <div className="row">
        <button className="btn btn-primary btn-small" style={{ background: "var(--bad)" }} disabled={pending}><Icon n="ban" />{t("series.stop.button")}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>{t("svc.cancel")}</button>
      </div>
    </form>
  );
}
