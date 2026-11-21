"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { minToTime } from "@/lib/time";
import { ACCENTS, mediaUrl } from "@/lib/media";
import { shrinkImage } from "@/lib/resize";
import { TimeSelect } from "@/components/TimeSelect";
import { Icon } from "@/components/Icon";
import { saveProvider, type ProviderState } from "./actions";

const t = translator("he");
export type Provider = { id: string; name: string; color: string; active: boolean; bio: string | null; photo: string | null; offerings: string[] | null; hours: { weekday: number; start: number; end: number }[] | null };

/** Add or edit one person who takes appointments: name, colour, services and hours. */
export function ProviderForm({ business, slug, offerings, provider, onDone }: {
  business: string; slug: string; offerings: { id: string; name: string }[]; provider?: Provider; onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<ProviderState, FormData>(saveProvider, null);
  const [color, setColor] = useState(provider?.color ?? ACCENTS[1]);
  const [all, setAll] = useState(!provider?.offerings);
  const [own, setOwn] = useState(!!provider?.hours);
  const [open, setOpen] = useState<boolean[]>(() => [0, 1, 2, 3, 4, 5, 6].map((d) => provider?.hours ? provider.hours.some((h) => h.weekday === d) : d <= 4));
  useEffect(() => { if (state?.ok) onDone?.(); }, [state?.ok, onDone]);
  // The photo is shrunk on the phone and placed back into the file field, so it goes with the form on save.
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(mediaUrl(provider?.photo ?? null));
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  async function pickPhoto(file: File | undefined) {
    if (!file || !fileInput.current) return;
    setPhotoBusy(true);
    try {
      const blob = await shrinkImage(file, 600);
      const small = new File([blob], "photo.jpg", { type: "image/jpeg" });
      const dt = new DataTransfer(); dt.items.add(small); fileInput.current.files = dt.files;
      setPreview(URL.createObjectURL(small)); setRemovePhoto(false);
    } catch { fileInput.current.value = ""; }
    setPhotoBusy(false);
  }
  const h = (d: number) => provider?.hours?.find((x) => x.weekday === d);
  return (
    <form action={action} className="card" style={{ gap: 12 }}>
      <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
      {provider && <input type="hidden" name="id" value={provider.id} />}
      <input type="hidden" name="color" value={color} />
      <label className="field"><span className="label">{t("prov.name")}</span>
        <input className="input" name="name" required minLength={2} maxLength={40} defaultValue={provider?.name} placeholder={t("prov.name.ph")} /></label>
      <div className="field"><span className="label">{t("prov.photo")}</span>
        <div className="row" style={{ gap: 12 }}>
          {preview ? <img src={preview} alt="" className="prov-photo" style={{ width: 64, height: 64 }} />
            : <span className="avatar" style={{ width: 64, height: 64, fontSize: 24, background: color, color: "#fff" }}>{provider?.name.slice(0, 1) ?? <Icon n="user" />}</span>}
          <input ref={fileInput} type="file" name="photo" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
          <button type="button" className="btn btn-secondary btn-small" disabled={photoBusy} onClick={() => fileInput.current?.click()}><Icon n="image" />{photoBusy ? t("design.uploading") : preview ? t("prov.photo.change") : t("prov.photo.add")}</button>
          {preview && <button type="button" className="link-btn small" onClick={() => { setPreview(null); setRemovePhoto(true); if (fileInput.current) fileInput.current.value = ""; }}>{t("prov.photo.remove")}</button>}
          {removePhoto && <input type="hidden" name="remove_photo" value="1" />}
        </div></div>
      <label className="field"><span className="label">{t("prov.bio")}</span>
        <input className="input" name="bio" maxLength={160} defaultValue={provider?.bio ?? ""} placeholder={t("prov.bio.ph")} />
        <span className="muted small">{t("prov.bio.hint")}</span></label>
      <div className="field"><span className="label">{t("prov.color")}</span>
        <div className="swatches" role="radiogroup" aria-label={t("prov.color")}>
          {ACCENTS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className="swatch" style={{ background: c }} onClick={() => setColor(c)}>{color === c && <Icon n="check" size={16} />}</button>)}
        </div></div>
      <div className="field"><span className="label">{t("prov.services")}</span>
        <label className="check"><input type="checkbox" name="all_services" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t("prov.services.all")}</label>
        {!all && offerings.map((o) => (
          <label key={o.id} className="check" style={{ paddingInlineStart: 24 }}><input type="checkbox" name="offering" value={o.id} defaultChecked={provider?.offerings?.includes(o.id) ?? true} /> {o.name}</label>
        ))}</div>
      <div className="field"><span className="label">{t("prov.hours")}</span>
        <label className="check"><input type="checkbox" name="own_hours" checked={own} onChange={(e) => setOwn(e.target.checked)} /> {t("prov.hours.own")}</label>
        {!own && <span className="muted small">{t("prov.hours.business")}</span>}
        {own && [0, 1, 2, 3, 4, 5, 6].map((d) => (
          <div key={d} className="list-row hours-day" style={{ minHeight: 48 }}>
            <label className="hours-toggle">
              <input type="checkbox" className="switch" name={`open-${d}`} checked={open[d]} onChange={(e) => setOpen((o) => o.map((x, i) => (i === d ? e.target.checked : x)))} aria-label={t(`day.${d}` as MessageKey)} />
              <span className={open[d] ? undefined : "muted"}>{t(`day.${d}` as MessageKey)}</span>
            </label>
            {open[d] ? (
              <div className="hours-times" dir="ltr">
                <TimeSelect name={`start-${d}`} defaultValue={h(d) ? minToTime(h(d)!.start) : "09:00"} from={5 * 60} to={23 * 60} label={`${t(`day.${d}` as MessageKey)} ${t("off.from")}`} />
                <span>–</span>
                <TimeSelect name={`end-${d}`} defaultValue={h(d) ? minToTime(h(d)!.end) : "18:00"} from={6 * 60} to={24 * 60} label={`${t(`day.${d}` as MessageKey)} ${t("off.to")}`} />
              </div>
            ) : <span className="muted small">{t("hours.closed")}</span>}
          </div>
        ))}</div>
      {provider && <label className="check"><input type="checkbox" name="active" value="off" defaultChecked={!provider.active} /> {t("prov.inactive")}</label>}
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <div className="row">
        <button className="btn btn-primary btn-small" disabled={pending}><Icon n="check" />{pending ? t("set.saving") : t("set.save")}</button>
        {onDone && <button type="button" className="btn btn-secondary btn-small" onClick={onDone}>{t("svc.cancel")}</button>}
      </div>
    </form>
  );
}
