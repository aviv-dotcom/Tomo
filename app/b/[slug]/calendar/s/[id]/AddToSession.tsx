"use client";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import { addToSession, type FormState } from "../../actions";

const t = translator("he");

export function AddToSession({ session, slug, full, people }: { session: string; slug: string; full: boolean; people: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addToSession, null);
  return (
    <form action={action} className="card">
      <h2 className="card-title">{t("session.add")}</h2>
      <input type="hidden" name="session" value={session} /><input type="hidden" name="slug" value={slug} />
      <select className="input" name="person" required defaultValue="">
        <option value="" disabled>{t("appt.person.choose")}</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {full && <p className="muted small" style={{ margin: 0 }}>{t("session.full")}</p>}
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <button className="btn btn-primary btn-small" disabled={pending}>{t("today.people.add")}</button>
    </form>
  );
}
