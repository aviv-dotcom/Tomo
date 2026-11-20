"use client";
import Link from "next/link";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { createClassSeries, type FormState } from "../actions";

const t = translator("he");

export function ClassForm({ business, slug, offerings }: { business: string; slug: string; offerings: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createClassSeries, null);
  return (
    <main className="page">
      <Link href={`/b/${slug}/calendar`} className="muted small">→ {t("back")}</Link>
      <h1 className="h1">{t("class.title")}</h1>
      {offerings.length === 0 ? <p className="muted">{t("class.no_services")}</p> : (
        <form action={action} className="card" style={{ gap: 14 }}>
          <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
          <label className="field"><span className="label">{t("class.service")}</span>
            <select className="input" name="offering">{offerings.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label className="field"><span className="label">{t("class.weekday")}</span>
            <select className="input" name="weekday">{[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{t(`day.${d}` as MessageKey)}</option>)}</select></label>
          <label className="field"><span className="label">{t("class.time")}</span><input className="input input-ltr" type="time" name="time" defaultValue="19:00" step={300} required /></label>
          <label className="field"><span className="label">{t("class.capacity")}</span><input className="input input-ltr" type="number" name="capacity" min={1} max={500} defaultValue={10} required /></label>
          <label className="field"><span className="label">{t("class.location")}</span><input className="input" name="location" maxLength={80} /></label>
          {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
          <button className="btn btn-primary" disabled={pending}>{pending ? t("class.creating") : t("class.create")}</button>
        </form>
      )}
    </main>
  );
}
