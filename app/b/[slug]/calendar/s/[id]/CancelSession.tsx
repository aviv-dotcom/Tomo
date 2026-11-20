"use client";
import { useActionState, useState } from "react";
import { translator } from "@/lib/i18n";
import { cancelSession, type FormState } from "../../actions";
import { Icon, Title } from "@/components/Icon";

const t = translator("he");

export function CancelSession({ session, slug, date }: { session: string; slug: string; date: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(cancelSession, null);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn btn-secondary btn-small" style={{ color: "var(--bad)" }} onClick={() => setOpen(true)}><Icon n="ban" />{t("cancel.title")}</button>;
  return (
    <form action={action} className="card" onSubmit={(e) => { if (!confirm(t("cancel.confirm"))) e.preventDefault(); }}>
      <Title n="ban">{t("cancel.title")}</Title>
      <input type="hidden" name="session" value={session} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="date" value={date} />
      <input className="input" name="reason" maxLength={120} placeholder={t("cancel.reason")} aria-label={t("cancel.reason")} />
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <div className="row">
        <button className="btn btn-primary btn-small" style={{ background: "var(--bad)" }} disabled={pending}><Icon n="ban" />{t("cancel.button")}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>{t("svc.cancel")}</button>
      </div>
    </form>
  );
}
