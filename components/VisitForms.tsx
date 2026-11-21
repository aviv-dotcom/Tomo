"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shrinkImage } from "@/lib/resize";
import { shekels, whatsappLink } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { removePhoto, saveAlert, saveRecommendations, saveVisitNote, shareVisit, uploadPhoto, type SaveState } from "@/app/b/[slug]/people/[id]/actions";

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

export type VisitPhoto = { id: string; kind: string; url: string | null };
export type VisitCardProps = {
  business: string; slug: string; person: string; booking: string;
  note: string | null; shared: boolean; token: string | null; photos: VisitPhoto[];
  phone: string | null; clientName: string; businessName: string; base: string;
  recommendations: string | null; products: Product[]; productOptions: Product[];
  /** The business's switches (Settings): before/after photos and recommendations. What already exists always shows. */
  withPhotos: boolean; withRecs: boolean;
};
export type Product = { id: string; name: string; priceAgorot: number };

/**
 * One visit's summary card: what was done, before and after photos, and whether the client sees it.
 * The text reads as finished text once saved; editing is a tap away.
 */
export function VisitCard(p: VisitCardProps) {
  const router = useRouter();
  const [note, setNote] = useState(p.note ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const [shared, setShared] = useState(p.shared);
  const [token, setToken] = useState(p.token);
  const [copied, setCopied] = useState(false);
  const [showPhotos, setShowPhotos] = useState(p.photos.length > 0);

  function save() {
    const fd = new FormData(); fd.set("booking", p.booking); fd.set("note", draft);
    start(async () => {
      const r = await saveVisitNote(null, fd);
      if (r?.error) { setError(r.error); return; }
      setError(null); setNote(draft.trim()); setEditing(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
      router.refresh();
    });
  }
  function share(on: boolean) {
    const fd = new FormData(); fd.set("booking", p.booking); fd.set("shared", on ? "1" : ""); fd.set("slug", p.slug); fd.set("person", p.person);
    setShared(on);
    start(async () => {
      const r = await shareVisit(fd);
      if (r.error) { setShared(!on); setError(r.error); return; }
      setError(null); setToken(r.token ?? null); router.refresh();
    });
  }
  const link = token ? `${p.base}/v/${token}` : "";
  const first = p.clientName.split(" ")[0];
  const message = t("visit.share.msg").replace("{name}", first).replace("{business}", p.businessName).replace("{url}", link);
  const before = p.photos.filter((x) => x.kind === "before"), after = p.photos.filter((x) => x.kind !== "before");

  return (
    <div className="visit-card">
      {/* What was done */}
      {editing ? (
        <div className="visit-note">
          <textarea className="input" rows={3} maxLength={2000} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
            placeholder={t("visit.placeholder")} aria-label={t("visit.title")} />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary btn-small" disabled={pending} onClick={save}><Icon n="check" />{t("visit.save")}</button>
            <button type="button" className="btn btn-secondary btn-small" disabled={pending} onClick={() => { setDraft(note); setEditing(false); }}>{t("visit.cancel")}</button>
          </div>
        </div>
      ) : note ? (
        <div className="visit-text">
          <p>{note}</p>
          <button type="button" className="link-btn small" onClick={() => { setDraft(note); setEditing(true); }}><Icon n="edit" size={14} />{t("visit.edit")}</button>
        </div>
      ) : (
        <button type="button" className="visit-empty" onClick={() => { setDraft(""); setEditing(true); }}><Icon n="edit" size={16} />{t("visit.write")}</button>
      )}
      {saved && <span className="muted small row" role="status" style={{ gap: 4 }}><Icon n="check" size={14} />{t("card.saved")}</span>}

      {/* Recommendations and products (optional) */}
      <Recommendations {...p} />

      {/* Before and after: opened with a button, shown when there are photos */}
      {showPhotos ? (
        <div className="ba">
          <PhotoColumn {...p} label={t("photo.before")} kind="before" photos={before} />
          <PhotoColumn {...p} label={t("photo.after")} kind="after" photos={after} />
        </div>
      ) : p.withPhotos && (
        <button type="button" className="btn btn-secondary btn-small visit-add" onClick={() => setShowPhotos(true)}><Icon n="image" />{t("visit.add.photos")}</button>
      )}

      {/* Share with the client */}
      <div className="visit-share">
        <label className="row" style={{ gap: 10, cursor: "pointer" }}>
          <input type="checkbox" className="switch" checked={shared} disabled={pending} onChange={(e) => share(e.target.checked)} />
          <span className="grow"><b className="small">{t("visit.share")}</b>
            <span className="muted small" style={{ display: "block" }}>{shared ? t("visit.share.on") : t("visit.share.off")}</span></span>
        </label>
        {shared && token && (
          <div className="row btn-row">
            {p.phone && <a className="btn btn-primary btn-small" href={whatsappLink(p.phone, message)} target="_blank" rel="noopener noreferrer"><Icon n="chat" />{t("visit.share.send")}</a>}
            <button type="button" className="btn btn-secondary btn-small" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
              <Icon n={copied ? "check" : "link"} />{copied ? t("site.copied") : t("visit.share.copy")}</button>
            <a className="btn btn-secondary btn-small" href={`/v/${token}`} target="_blank" rel="noopener noreferrer"><Icon n="eye" />{t("visit.share.preview")}</a>
          </div>
        )}
      </div>
      {error && <span className="error">{t(error)}</span>}
    </div>
  );
}

function PhotoColumn({ label, kind, photos, business, slug, person, booking }: VisitCardProps & { label: string; kind: "before" | "after"; photos: VisitPhoto[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const blob = await shrinkImage(file, 1600);
      const fd = new FormData();
      fd.set("business", business); fd.set("slug", slug); fd.set("person", person); fd.set("kind", kind); fd.set("booking", booking);
      fd.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      const r = await uploadPhoto(fd);
      if (r.error) setError(r.error); else router.refresh();
    } catch { setError("err.invalid_image"); }
    setBusy(false);
  }
  async function remove(id: string) {
    if (!confirm(t("photo.remove.confirm"))) return;
    const fd = new FormData(); fd.set("photo", id); fd.set("slug", slug); fd.set("person", person);
    await removePhoto(fd); router.refresh();
  }
  return (
    <div className="ba-col">
      <span className="ba-label">{label}</span>
      {photos.map((f) => (
        <div key={f.id} className="photo">
          {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer"><img src={f.url} alt={label} loading="lazy" /></a>}
          <button type="button" className="photo-x" aria-label={t("photo.remove")} title={t("photo.remove")} onClick={() => remove(f.id)}><Icon n="x" size={14} /></button>
        </div>
      ))}
      <input ref={input} type="file" accept="image/*" hidden data-kind={kind} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="ba-add" disabled={busy} onClick={() => input.current?.click()}>
        <Icon n={busy ? "clock" : "image"} size={20} /><span className="small">{busy ? t("design.uploading") : t(kind === "before" ? "photo.add.before" : "photo.add.after")}</span>
      </button>
      {error && <span className="error small">{t(error)}</span>}
    </div>
  );
}

/** What the client should do next, and which of the business's products fit. Opened with a button. */
function Recommendations(p: VisitCardProps) {
  const router = useRouter();
  const [text, setText] = useState(p.recommendations ?? "");
  const [chosen, setChosen] = useState<string[]>(p.products.map((x) => x.id));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [pick, setPick] = useState<string[]>(chosen);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const names = new Map([...p.productOptions, ...p.products].map((x) => [x.id, x]));
  const has = !!text || chosen.length > 0;
  function save() {
    const fd = new FormData(); fd.set("booking", p.booking); fd.set("text", draft); pick.forEach((id) => fd.append("product", id));
    start(async () => {
      const r = await saveRecommendations(fd);
      if (r.error) { setError(r.error); return; }
      setError(null); setText(draft.trim()); setChosen(pick); setEditing(false); router.refresh();
    });
  }
  const open = () => { setDraft(text); setPick(chosen); setEditing(true); };
  if (editing) return (
    <div className="visit-recs">
      <b className="small row" style={{ gap: 6 }}><Icon n="sparkles" size={15} />{t("visit.recs")}</b>
      <textarea className="input" rows={3} maxLength={2000} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus placeholder={t("visit.recs.placeholder")} aria-label={t("visit.recs")} />
      {p.productOptions.length > 0 ? (<>
        <span className="muted small">{t("visit.recs.products")}</span>
        <div className="chips">
          {p.productOptions.map((o) => {
            const on = pick.includes(o.id);
            return <button key={o.id} type="button" role="checkbox" aria-checked={on} className={`chip ${on ? "chip-on" : ""}`}
              onClick={() => setPick((x) => (on ? x.filter((y) => y !== o.id) : [...x, o.id]))}>{on && <Icon n="check" size={13} />}{o.name} · {shekels(o.priceAgorot)}</button>;
          })}
        </div></>) : <span className="muted small">{t("visit.recs.no_products")}</span>}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-primary btn-small" disabled={pending} onClick={save}><Icon n="check" />{t("card.save")}</button>
        <button type="button" className="btn btn-secondary btn-small" disabled={pending} onClick={() => setEditing(false)}>{t("visit.cancel")}</button>
      </div>
      {error && <span className="error">{t(error)}</span>}
    </div>
  );
  if (has) return (
    <div className="visit-recs">
      <b className="small row" style={{ gap: 6 }}><Icon n="sparkles" size={15} />{t("visit.recs")}</b>
      {text && <p style={{ margin: 0, lineHeight: 1.65, whiteSpace: "pre-line" }}>{text}</p>}
      {chosen.map((id) => names.get(id)).filter(Boolean).map((o) => (
        <span key={o!.id} className="rec-product"><Icon n="tag" size={14} /><span className="grow">{o!.name}</span><span className="muted small">{shekels(o!.priceAgorot)}</span></span>
      ))}
      <button type="button" className="link-btn small" style={{ padding: 0, alignSelf: "start" }} onClick={open}><Icon n="edit" size={14} />{t("visit.edit")}</button>
    </div>
  );
  return p.withRecs ? <button type="button" className="btn btn-secondary btn-small visit-add" onClick={open}><Icon n="sparkles" />{t("visit.add.recs")}</button> : null;
}
