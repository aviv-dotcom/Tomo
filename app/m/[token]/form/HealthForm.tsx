"use client";
import Link from "next/link";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import { clientSubmitForm, type MState } from "../actions";

const t = translator("he");

export function HealthForm({ token, business, questions }: { token: string; business: string; questions: string[] }) {
  const [state, action, pending] = useActionState<MState, FormData>(clientSubmitForm, null);
  return (
    <main className="page" style={{ paddingBottom: 40 }}>
      <Link href={`/m/${token}`} className="muted small">→ {t("back")}</Link>
      <h1 className="h1">{t("form.title")}</h1>
      <span className="muted">{business}</span>
      <form action={action} className="card" style={{ gap: 14 }}>
        <input type="hidden" name="token" value={token} /><input type="hidden" name="count" value={questions.length} />
        {questions.map((q, i) => (
          <fieldset key={i} className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 6 }}>{q}</legend>
            <div className="row">
              <label className="check"><input type="radio" name={`q${i}`} value="yes" required /> {t("form.yes")}</label>
              <label className="check"><input type="radio" name={`q${i}`} value="no" /> {t("form.no")}</label>
            </div>
          </fieldset>
        ))}
        <label className="field"><span className="label">{t("form.details")}</span><textarea className="input" name="details" rows={3} maxLength={1000} style={{ padding: 10 }} /></label>
        <label className="field"><span className="label">{t("form.sign")}</span><input className="input" name="signed_name" required minLength={2} maxLength={80} autoComplete="name" /></label>
        <label className="check"><input type="checkbox" name="confirm" required /> {t("form.confirm")}</label>
        <p className="muted small" style={{ margin: 0 }}>{t("form.private")}</p>
        {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
        <button className="btn btn-primary" disabled={pending}>{pending ? t("form.sending") : t("form.submit")}</button>
      </form>
    </main>
  );
}
