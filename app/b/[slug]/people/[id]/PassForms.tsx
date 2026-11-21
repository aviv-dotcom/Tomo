"use client";
import { useActionState, useState } from "react";
import { translator } from "@/lib/i18n";
import { shekels } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { saveNotes, sellPass, type SaveState } from "./actions";

const t = translator("he");

export function SellPass({ person, slug, offerings }: { person: string; slug: string; offerings: { id: string; name: string; price_agorot: number }[] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(sellPass, null);
  if (offerings.length === 0) return <p className="muted small" style={{ margin: 0 }}>{t("pass.none_defined")}</p>;
  return (
    <form action={action} className="row" style={{ flexWrap: "wrap" }}>
      <input type="hidden" name="person" value={person} /><input type="hidden" name="slug" value={slug} />
      <select className="input" name="offering" aria-label={t("pass.sell")} style={{ flex: "1 1 180px", minHeight: 40 }}>
        {offerings.map((o) => <option key={o.id} value={o.id}>{o.name} · {shekels(o.price_agorot)}</option>)}
      </select>
      <button className="btn btn-primary btn-small" disabled={pending}><Icon n="plus" />{t("pass.sell")}</button>
      {state?.error && <p className="error" role="alert" style={{ width: "100%" }}>{t(state.error)}</p>}
      {state?.ok && !pending && <p className="muted small" role="status" style={{ width: "100%", margin: 0 }}><Icon n="check" size={15} />{t("pass.sold")}</p>}
    </form>
  );
}

export function NotesForm({ person, notes }: { person: string; notes: string | null }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveNotes, null);
  const [text, setText] = useState(notes ?? "");
  const [dirty, setDirty] = useState(false);
  return (
    <form action={(fd) => { setDirty(false); action(fd); }} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input type="hidden" name="person" value={person} />
      <textarea className="input" name="notes" rows={3} maxLength={2000} value={text} onChange={(e) => { setText(e.target.value); setDirty(true); }}
        placeholder={t("notes.placeholder")} aria-label={t("notes.title")} style={{ padding: 10, lineHeight: 1.5 }} />
      <div className="row">
        <button className="btn btn-secondary btn-small" disabled={pending || !dirty}><Icon n="check" />{t("card.save")}</button>
        {state?.ok && !pending && !dirty && <span className="muted small" role="status"><Icon n="check" size={15} />{t("card.saved")}</span>}
        {state?.error && <span className="error" role="alert">{t(state.error)}</span>}
      </div>
    </form>
  );
}
