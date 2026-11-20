"use client";
import { useActionState, useEffect, useRef } from "react";
import { translator } from "@/lib/i18n";
import { addPerson, type AddPersonState } from "./actions";
import { Icon } from "@/components/Icon";

const t = translator("he");

export function AddPerson({ business, slug }: { business: string; slug: string }) {
  const [state, action, pending] = useActionState<AddPersonState, FormData>(addPerson, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state?.ok]);
  return (
    <form ref={form} action={action} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input type="hidden" name="business" value={business} />
      <input type="hidden" name="slug" value={slug} />
      <input className="input" name="name" required minLength={2} maxLength={80} placeholder={t("today.people.name")} aria-label={t("today.people.name")} />
      <input className="input input-ltr" name="phone" type="tel" inputMode="tel" placeholder={t("today.people.phone")} aria-label={t("today.people.phone")} />
      <label className="check"><input type="checkbox" name="lead" /> {t("today.people.lead")}</label>
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <button className="btn btn-primary btn-small" disabled={pending}><Icon n="plus" />{pending ? t("today.people.adding") : t("today.people.add")}</button>
    </form>
  );
}
