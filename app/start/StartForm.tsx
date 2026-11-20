"use client";
import { useActionState, useState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { templates } from "@/lib/templates";
import { shekels, suggestSlug } from "@/lib/format";
import { createBusiness, type StartState } from "./actions";

const t = translator("he");

export function StartForm() {
  const [state, action, pending] = useActionState<StartState, FormData>(createBusiness, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [key, setKey] = useState<string>("beauty");
  const tpl = templates.find((x) => x.key === key)!;

  return (
    <main className="page">
      <h1 className="h1">{t("start.title")}</h1>
      <p className="sub">{t("start.subtitle")}</p>
      <form action={action} className="card" style={{ gap: 16 }}>
        <label className="field">
          <span className="label">{t("start.name")}</span>
          <input className="input" name="name" required minLength={2} maxLength={80} placeholder={t("start.name.placeholder")}
            value={name} onChange={(e) => { setName(e.target.value); if (!slugEdited) setSlug(e.target.value.trim() ? suggestSlug(e.target.value) : ""); }} />
        </label>
        <label className="field">
          <span className="label">{t("start.slug")}</span>
          <input className="input input-ltr" name="slug" required pattern="[a-z0-9][a-z0-9-]{2,39}" value={slug}
            onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase()); }} />
          <span className="muted small">{t("start.slug.help")}</span>
        </label>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>{t("start.template")}</legend>
          <div className="tiles">
            {templates.map((x) => (
              <label key={x.key} className="tile">
                <input type="radio" name="template" value={x.key} checked={key === x.key} onChange={() => setKey(x.key)} />
                <span className="tile-emoji" aria-hidden="true">{x.emoji}</span>
                <b>{t(`template.${x.key}.name` as MessageKey)}</b>
                <span className="muted small">{t(`template.${x.key}.desc` as MessageKey)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {tpl.sampleOfferings.length > 0 && (
          <div className="field">
            <span className="label">{t("start.preview")}</span>
            {tpl.sampleOfferings.map((o) => (
              <div key={o.name} className="list-row small">
                <span className="grow">{o.name}</span>
                <span className="price">{shekels(o.priceAgorot)}</span>
              </div>
            ))}
          </div>
        )}
        {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
        <button className="btn btn-primary" disabled={pending}>{pending ? t("start.submitting") : t("start.submit")}</button>
      </form>
    </main>
  );
}
