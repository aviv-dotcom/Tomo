"use client";
import { useActionState, useState } from "react";
import { translator } from "@/lib/i18n";
import { saveCancelHours, updateBusiness, type SettingsState } from "./actions";

const t = translator("he");

export function BusinessForm({ business, name, slug, saved }: { business: string; name: string; slug: string; saved: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateBusiness, null);
  const [newSlug, setNewSlug] = useState(slug);
  const changed = newSlug.trim().toLowerCase() !== slug;
  return (
    <form action={action} className="card" onSubmit={(e) => { if (changed && !confirm(t("set.slug.confirm"))) e.preventDefault(); }}>
      <h2 className="card-title">{t("set.business")}</h2>
      <input type="hidden" name="business" value={business} /><input type="hidden" name="old_slug" value={slug} />
      <label className="field"><span className="label">{t("set.name")}</span>
        <input className="input" name="name" defaultValue={name} required minLength={2} maxLength={80} /></label>
      <label className="field"><span className="label">{t("set.slug")}</span>
        <div className="input input-ltr slug-field" dir="ltr"><span className="muted">/p/</span>
          <input name="slug" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} required minLength={3} maxLength={40}
            pattern="[a-zA-Z0-9][a-zA-Z0-9\-]+" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label={t("set.slug")} /></div></label>
      {changed && <p className="small" style={{ margin: 0, background: "var(--warn-soft)", padding: 10, borderRadius: 10 }}>{t("set.slug.warn")}</p>}
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      {(state?.ok || saved) && !pending && <p className="muted small" role="status">✓ {t("set.saved")}</p>}
      <button className="btn btn-primary btn-small" disabled={pending}>{pending ? t("set.saving") : t("set.save")}</button>
    </form>
  );
}

export function PolicyForm({ business, slug, hours }: { business: string; slug: string; hours: number }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveCancelHours, null);
  return (
    <form action={action} className="card">
      <h2 className="card-title">{t("policy.title")}</h2>
      <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
      <label className="row small" style={{ flexWrap: "wrap" }}>{t("policy.hours")}
        <select className="input" name="hours" defaultValue={String(hours)} style={{ minHeight: 40 }} aria-label={t("policy.hours")}>
          {[0, 2, 4, 6, 12, 24, 36, 48, 72, 168].concat([0, 2, 4, 6, 12, 24, 36, 48, 72, 168].includes(hours) ? [] : [hours]).sort((a, b) => a - b)
            .map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        {t("policy.hours.unit")}</label>
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      {state?.ok && !pending && <p className="muted small" role="status">✓ {t("set.saved")}</p>}
      <button className="btn btn-secondary btn-small" disabled={pending}>{t("policy.save")}</button>
    </form>
  );
}
