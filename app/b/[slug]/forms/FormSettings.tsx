"use client";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import { saveForm, type FormsState } from "./actions";

const t = translator("he");

export function FormSettings({ business, slug, enabled, questions }: { business: string; slug: string; enabled: boolean; questions: string[] }) {
  const [state, action, pending] = useActionState<FormsState, FormData>(saveForm, null);
  return (
    <form action={action} className="card" style={{ gap: 12 }}>
      <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
      <label className="check" style={{ fontWeight: 600 }}><input type="checkbox" name="enabled" defaultChecked={enabled} /> {t("forms.enabled")}</label>
      <label className="field"><span className="label">{t("forms.questions")}</span>
        <textarea className="input" name="questions" rows={7} style={{ padding: 12, lineHeight: 1.6 }} defaultValue={(questions.length ? questions : t("forms.default").split("\n")).join("\n")} /></label>
      <p className="muted small" style={{ margin: 0 }}>{t("form.private")}</p>
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      {state?.ok && !pending && <p className="muted small" role="status">✓ {t("forms.saved")}</p>}
      <button className="btn btn-primary" disabled={pending}>{t("forms.save")}</button>
    </form>
  );
}
