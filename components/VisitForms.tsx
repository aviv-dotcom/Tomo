"use client";
import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shrinkImage } from "@/lib/resize";
import { Icon } from "@/components/Icon";
import { saveAlert, saveVisitNote, uploadPhoto, type SaveState } from "@/app/b/[slug]/people/[id]/actions";

const t = translator("he");

/** The client's sensitivity alert: shown loudly, edited in place. */
export function AlertEditor({ person, slug, alert }: { person: string; slug: string; alert: string | null }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveAlert, null);
  const [open, setOpen] = useState(false);
  if (!open) {
    return alert ? (
      <button type="button" className="alert-banner" onClick={() => setOpen(true)} aria-label={t("alert.edit")}><Icon n="alert" size={18} /><span className="grow">{alert}</span><Icon n="edit" size={15} /></button>
    ) : <button type="button" className="link-btn small" style={{ alignSelf: "start", padding: 0 }} onClick={() => setOpen(true)}><Icon n="alert" size={15} style={{ marginInlineEnd: 6 }} />{t("alert.add")}</button>;
  }
  return (
    <form action={(fd) => { action(fd); setOpen(false); }} className="alert-banner" style={{ flexWrap: "wrap" }}>
      <input type="hidden" name="person" value={person} /><input type="hidden" name="slug" value={slug} />
      <Icon n="alert" size={18} />
      <input className="input" name="alert" defaultValue={alert ?? ""} maxLength={120} placeholder={t("alert.placeholder")} aria-label={t("alert.title")} style={{ flex: "1 1 200px", minHeight: 40 }} autoFocus />
      <button className="btn btn-primary btn-small" disabled={pending}><Icon n="check" />{t("card.save")}</button>
      {state?.error && <span className="error">{t(state.error)}</span>}
    </form>
  );
}

/** What was done in this visit. */
export function VisitNoteForm({ booking, note }: { booking: string; note: string | null }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveVisitNote, null);
  const [text, setText] = useState(note ?? "");
  const [dirty, setDirty] = useState(false);
  return (
    <form action={(fd) => { setDirty(false); action(fd); }} className="visit-note">
      <input type="hidden" name="booking" value={booking} />
      <textarea className="input" name="note" rows={2} maxLength={2000} value={text} onChange={(e) => { setText(e.target.value); setDirty(true); }}
        placeholder={t("visit.placeholder")} aria-label={t("visit.title")} />
      <div className="row">
        <button className="btn btn-secondary btn-small" disabled={pending || !dirty}><Icon n="check" />{t("visit.save")}</button>
        {state?.ok && !pending && !dirty && <span className="muted small" role="status"><Icon n="check" size={14} />{t("card.saved")}</span>}
        {state?.error && <span className="error">{t(state.error)}</span>}
      </div>
    </form>
  );
}

/** Adds a before / after photo for a client (and a visit). Shrunk on the phone, stored privately. */
export function PhotoUploader({ business, slug, person, booking }: { business: string; slug: string; person: string; booking?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"before" | "after">("before");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const blob = await shrinkImage(file, 1600);
      const fd = new FormData();
      fd.set("business", business); fd.set("slug", slug); fd.set("person", person); fd.set("kind", kind);
      if (booking) fd.set("booking", booking);
      fd.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      const r = await uploadPhoto(fd);
      if (r.error) setError(r.error); else router.refresh();
    } catch { setError("err.invalid_image"); }
    setBusy(false);
  }
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      <div className="chips" role="radiogroup" aria-label={t("photo.kind")}>
        {(["before", "after"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={`chip ${kind === k ? "chip-on" : ""}`} onClick={() => setKind(k)}>{t(`photo.${k}`)}</button>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => input.current?.click()}><Icon n="image" />{busy ? t("design.uploading") : t("photo.add")}</button>
      {error && <span className="error">{t(error)}</span>}
    </div>
  );
}
