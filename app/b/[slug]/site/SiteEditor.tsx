"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { ACCENTS, mediaUrl, PAGE_SECTIONS, type PageSection } from "@/lib/media";
import { shrinkImage } from "@/lib/resize";
import { Icon, IconTile, Title, type IconName } from "@/components/Icon";
import { PublicPageView, type PageData } from "@/components/PublicPageView";
import { removeMedia, saveSite, uploadMedia, type SiteState } from "./actions";

const t = translator("he");
const SECTION_ICON: Record<PageSection, IconName> = { services: "tag", classes: "calendar", gallery: "image", about: "info", hours: "clock", contact: "chat" };
const MAX: Record<"logo" | "cover" | "gallery_add", number> = { logo: 512, cover: 1600, gallery_add: 1400 };

type Props = { business: string; slug: string; back: { key: string; label: string }; published: boolean; base: PageData };

/** The business page editor: content, design, photos and sections, with a live preview of what clients will see. */
export function SiteEditor({ business, slug, back, published: initialPublished, base }: Props) {
  const [state, action, pending] = useActionState<SiteState, FormData>(saveSite, null);
  const [published, setPublished] = useState(initialPublished);
  const [draft, setDraft] = useState<PageData>(base);
  const [order, setOrder] = useState<{ key: PageSection; on: boolean }[]>(() => {
    const on = (base.sections ?? [...PAGE_SECTIONS]) as PageSection[];
    return [...on.map((key) => ({ key, on: true })), ...PAGE_SECTIONS.filter((k) => !on.includes(k)).map((key) => ({ key, on: false }))];
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<MessageKey | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(`/p/${slug}`);
  useEffect(() => setUrl(`${window.location.origin}/p/${slug}`), [slug]);

  const set = (patch: Partial<PageData>) => setDraft((d) => ({ ...d, ...patch }));
  const sections = order.filter((x) => x.on).map((x) => x.key);
  const view: PageData = { ...draft, sections };
  const move = (i: number, dir: -1 | 1) => setOrder((o) => { const n = [...o]; const j = i + dir; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function upload(kind: "logo" | "cover" | "gallery_add", file: File | undefined) {
    if (!file) return;
    setMediaError(null); setBusy(kind);
    try {
      const blob = await shrinkImage(file, MAX[kind]);
      const fd = new FormData();
      fd.set("business", business); fd.set("slug", slug); fd.set("kind", kind);
      fd.set("file", new File([blob], "image.jpg", { type: "image/jpeg" }));
      const r = await uploadMedia(fd);
      if (r.error || !r.path) setMediaError(r.error ?? "err.generic");
      else if (kind === "logo") set({ logo: r.path });
      else if (kind === "cover") set({ cover: r.path });
      else setDraft((d) => ({ ...d, gallery: [...d.gallery, r.path!] }));
    } catch { setMediaError("err.invalid_image"); }
    setBusy(null);
  }
  async function remove(kind: "logo_remove" | "cover_remove" | "gallery_remove", path: string | null) {
    setMediaError(null); setBusy(kind + (path ?? ""));
    const r = await removeMedia(business, slug, kind, path);
    if (r.error) setMediaError(r.error);
    else if (kind === "logo_remove") set({ logo: null });
    else if (kind === "cover_remove") set({ cover: null });
    else setDraft((d) => ({ ...d, gallery: d.gallery.filter((g) => g !== path) }));
    setBusy(null);
  }

  return (
    <div className="editor">
      <div className="editor-main">
        <section className="card">
          <Title n="link">{t("site.link")}</Title>
          <label className="list-row" style={{ cursor: "pointer", borderBottom: 0, padding: 0 }}>
            <span className="grow"><b>{t("site.published")}</b></span>
            <input type="checkbox" className="switch" checked={published} onChange={(e) => setPublished(e.target.checked)} aria-label={t("site.published")} />
          </label>
          <span className="input-ltr small" style={{ textAlign: "start", wordBreak: "break-all" }}>{url}</span>
          <div className="row btn-row">
            <a className="btn btn-secondary btn-small" href={`/p/${slug}`} target="_blank" rel="noopener noreferrer"><Icon n="external" />{t("site.open")}</a>
            <button type="button" className="btn btn-secondary btn-small" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>
              <Icon n={copied ? "check" : "copy"} />{copied ? t("site.copied") : t("site.copy")}</button>
          </div>
        </section>

        <section className="card">
          <Title n="palette" extra={<span className="muted small">{t("design.instant")}</span>}>{t("design.title")}</Title>
          <span className="label">{t("design.cover")}</span>
          <div className="cover-pick" style={draft.cover ? { backgroundImage: `url(${mediaUrl(draft.cover)})` } : undefined}>
            {!draft.cover && <Icon n="image" size={28} />}
            <div className="row" style={{ gap: 6 }}>
              <FilePick label={busy === "cover" ? t("design.uploading") : draft.cover ? t("design.replace") : t("design.upload")} disabled={!!busy} onFile={(f) => upload("cover", f)} />
              {draft.cover && <button type="button" className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => remove("cover_remove", null)}><Icon n="trash" /></button>}
            </div>
          </div>
          <div className="row" style={{ gap: 14 }}>
            {draft.logo ? <img src={mediaUrl(draft.logo) ?? ""} alt="" className="logo-pick" /> : <span className="logo-pick hero-mark" style={{ margin: 0 }}>{draft.name.slice(0, 1)}</span>}
            <span className="grow"><span className="label">{t("design.logo")}</span>
              <span className="row" style={{ gap: 6 }}>
                <FilePick label={busy === "logo" ? t("design.uploading") : draft.logo ? t("design.replace") : t("design.upload")} disabled={!!busy} onFile={(f) => upload("logo", f)} />
                {draft.logo && <button type="button" className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => remove("logo_remove", null)} aria-label={t("design.remove")}><Icon n="trash" /></button>}
              </span></span>
          </div>
          <span className="label">{t("design.color")}</span>
          <div className="swatches" role="radiogroup" aria-label={t("design.color")}>
            {ACCENTS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={(draft.accent ?? ACCENTS[0]) === c} aria-label={c} className="swatch" style={{ background: c }}
                onClick={() => set({ accent: c })}>{(draft.accent ?? ACCENTS[0]) === c && <Icon n="check" size={18} />}</button>
            ))}
          </div>
          {mediaError && <p className="error" role="alert">{t(mediaError)}</p>}
        </section>

        <section className="card">
          <Title n="image" extra={<span className="muted small">{draft.gallery.length}/9</span>}>{t("design.gallery")}</Title>
          <p className="muted small" style={{ margin: 0 }}>{t("design.gallery.hint")}</p>
          <div className="gallery">
            {draft.gallery.map((g) => (
              <div key={g} className="gallery-item">
                <img src={mediaUrl(g) ?? ""} alt="" />
                <button type="button" className="gallery-x" disabled={!!busy} onClick={() => remove("gallery_remove", g)} aria-label={t("design.remove")}><Icon n="x" size={14} /></button>
              </div>
            ))}
            {draft.gallery.length < 9 && (
              <label className="gallery-add">
                <input type="file" accept="image/*" hidden disabled={!!busy} onChange={(e) => { upload("gallery_add", e.target.files?.[0]); e.target.value = ""; }} />
                <Icon n={busy === "gallery_add" ? "clock" : "plus"} size={22} /><span className="small">{busy === "gallery_add" ? t("design.uploading") : t("design.add_photo")}</span>
              </label>
            )}
          </div>
        </section>

        <form className="card" style={{ gap: 12 }} onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}>
          <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="back" value={back.key} />
          <input type="hidden" name="published" value={published ? "on" : ""} />
          <input type="hidden" name="accent" value={draft.accent ?? ""} />
          <input type="hidden" name="sections" value={JSON.stringify(sections)} />
          <Title n="edit">{t("site.content")}</Title>
          <label className="field"><span className="label">{t("site.tagline")}</span>
            <input className="input" name="tagline" maxLength={120} value={draft.tagline ?? ""} onChange={(e) => set({ tagline: e.target.value })} /></label>
          <label className="field"><span className="label">{t("site.about")}</span>
            <textarea className="input" name="about" maxLength={1200} rows={5} style={{ padding: 12 }} value={draft.about ?? ""} onChange={(e) => set({ about: e.target.value })} /></label>
          <label className="field"><span className="label">{t("site.whatsapp")}</span>
            <input className="input input-ltr" name="whatsapp" type="tel" value={draft.whatsapp ?? ""} onChange={(e) => set({ whatsapp: e.target.value })} /></label>
          <label className="field"><span className="label">{t("site.address")}</span>
            <input className="input" name="address" maxLength={120} value={draft.address ?? ""} onChange={(e) => set({ address: e.target.value })} /></label>

          <Title n="globe" style={{ marginTop: 8 }}>{t("design.social")}</Title>
          {(["instagram", "facebook", "tiktok"] as const).map((k) => (
            <label key={k} className="field social-field"><span className="label row" style={{ gap: 6 }}><Icon n={k} size={16} />{t(`design.${k}` as MessageKey)}</span>
              <input className="input input-ltr" name={k} placeholder={t("design.handle")} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={draft[k] ?? ""} onChange={(e) => set({ [k]: e.target.value.replace(/^@/, "") || null })} /></label>
          ))}
          <label className="field"><span className="label row" style={{ gap: 6 }}><Icon n="globe" size={16} />{t("design.website")}</span>
            <input className="input input-ltr" name="website" inputMode="url" placeholder="https://" autoCapitalize="off" value={draft.website ?? ""} onChange={(e) => set({ website: e.target.value || null })} /></label>

          <Title n="layout" style={{ marginTop: 8 }}>{t("design.sections")}</Title>
          <p className="muted small" style={{ margin: 0 }}>{t("design.sections.hint")}</p>
          <div>
            {order.map((x, i) => (
              <div key={x.key} className="list-row" style={{ minHeight: 52 }}>
                <IconTile n={SECTION_ICON[x.key]} tone={x.on ? "accent" : "plain"} size={32} />
                <span className="grow" style={{ color: x.on ? undefined : "var(--ink-2)" }}>{t(`section.${x.key}` as MessageKey)}</span>
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("design.move_up")}><Icon n="up" /></button>
                <button type="button" className="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={t("design.move_down")}><Icon n="down" /></button>
                <input type="checkbox" className="switch" checked={x.on} aria-label={t(`section.${x.key}` as MessageKey)}
                  onChange={(e) => setOrder((o) => o.map((y) => (y.key === x.key ? { ...y, on: e.target.checked } : y)))} />
              </div>
            ))}
          </div>
          <p className="muted small" style={{ margin: 0 }}>{t("site.hint")}</p>
          {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
          <div className="row btn-row editor-actions">
            <button className="btn btn-primary" disabled={pending}><Icon n="check" />{pending ? t("site.saving") : t("site.save")}</button>
          </div>
          <p className="muted small" style={{ margin: 0, textAlign: "center" }}>{t("save.returns").replace("{place}", back.label)}</p>
        </form>
      </div>

      {!showPreview && <button type="button" className="btn btn-primary btn-small preview-fab" onClick={() => setShowPreview(true)}><Icon n="eye" />{t("design.preview")}</button>}
      <aside className={`editor-preview ${showPreview ? "open" : ""}`} aria-label={t("design.preview")}>
        <div className="preview-bar">
          <span className="grow small muted">{t("design.preview.note")}</span>
          <button type="button" className="btn btn-primary btn-small preview-close" onClick={() => setShowPreview(false)}><Icon n="edit" />{t("design.preview.close")}</button>
        </div>
        <div className="phone"><div className="phone-screen"><PublicPageView p={view} preview /></div></div>
      </aside>
    </div>
  );
}

function FilePick({ label, disabled, onFile }: { label: string; disabled: boolean; onFile: (f: File | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="btn btn-secondary btn-small" disabled={disabled} onClick={() => ref.current?.click()}><Icon n="image" />{label}</button>
    </>
  );
}
