"use client";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { savePerson, type SaveState } from "./actions";
import { Icon } from "@/components/Icon";

const t = translator("he");
type P = { id: string; name: string; phone: string | null; email: string | null; status: string; marketing_consent: boolean };

export function PersonForm({ p, slug }: { p: P; slug: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(savePerson, null);
  return (
    <details className="card fold-card" open={!!state?.error}>
      <summary className="card-title"><span className="title-in"><Icon n="edit" className="title-icon" />{t("card.details")}</span><Icon n="chev" className="chev" /></summary>
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
      <input type="hidden" name="id" value={p.id} /><input type="hidden" name="slug" value={slug} />
      <label className="field"><span className="label">{t("card.name")}</span><input className="input" name="name" defaultValue={p.name} required minLength={2} maxLength={80} /></label>
      <label className="field"><span className="label">{t("card.phone")}</span><input className="input input-ltr" name="phone" type="tel" defaultValue={p.phone ?? ""} /></label>
      <label className="field"><span className="label">{t("card.email")}</span><input className="input input-ltr" name="email" type="email" defaultValue={p.email ?? ""} /></label>
      <label className="field"><span className="label">{t("card.status")}</span>
        <select className="input" name="status" defaultValue={p.status}>
          {["active", "lead", "paused", "left"].map((s) => <option key={s} value={s}>{t(`status.${s}` as MessageKey)}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" name="marketing" defaultChecked={p.marketing_consent} /> {t("card.marketing")}</label>
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      {state?.ok && !pending && <p className="muted small" role="status"><Icon n="check" size={15} />{t("card.saved")}</p>}
      <button className="btn btn-primary btn-small" disabled={pending}>{pending ? t("card.saving") : t("card.save")}</button>
      </form>
    </details>
  );
}
