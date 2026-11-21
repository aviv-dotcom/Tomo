"use client";
import { useActionState, useEffect, useState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shekels } from "@/lib/format";
import { saveOffering, type SvcState } from "./actions";
import { Icon, IconTile } from "@/components/Icon";

const t = translator("he");
export type Offering = { id: string; name: string; delivery: string; billing: string; minutes: number | null; price_agorot: number;
  deposit_agorot: number | null; buffer_minutes: number; active: boolean; pack_entries: number | null; valid_days: number | null };
const DELIVERY = ["appointment", "class", "membership", "product", "addon"] as const;
const BILLING = ["one_time", "pack", "subscription", "dues"] as const;

/** A service row that opens into its edit form; with no offering it is the "new service" form. */
export function OfferingForm({ business, slug, offering }: { business: string; slug: string; offering?: Offering }) {
  const [state, action, pending] = useActionState<SvcState, FormData>(saveOffering, null);
  const [open, setOpen] = useState(false);
  const [delivery, setDelivery] = useState(offering?.delivery ?? "appointment");
  const [billing, setBilling] = useState(offering?.billing ?? "one_time");
  useEffect(() => { if (state?.ok) setOpen(false); }, [state?.ok]);
  const timed = delivery === "appointment" || delivery === "class" || delivery === "addon";

  if (!open) {
    return offering ? (
      <button type="button" className="list-row link-row" style={{ width: "100%", background: "none", border: 0, borderBottom: "1px solid var(--line)", textAlign: "start", cursor: "pointer" }} onClick={() => setOpen(true)}>
        <IconTile n={offering.delivery === "class" ? "users" : offering.delivery === "appointment" ? "user" : offering.delivery === "addon" ? "plus" : "tag"} tone={offering.active ? "accent" : "plain"} size={34} />
        <span className="grow"><span>{offering.name}</span>
          <span className="muted small">{t(`delivery.${offering.delivery}` as MessageKey)}{offering.minutes ? ` · ${offering.minutes} ${t("minutes")}` : ""}</span></span>
        {!offering.active && <span className="tag tag-warn">{t("svc.hidden")}</span>}
        <span className="price">{shekels(offering.price_agorot)}</span>
        <Icon n="edit" size={16} className="chev" />
      </button>
    ) : <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Icon n="plus" />{t("svc.add")}</button>;
  }
  return (
    <form action={action} className="card" style={{ gap: 12, margin: "8px 0" }}>
      <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
      {offering && <input type="hidden" name="id" value={offering.id} />}
      <label className="field"><span className="label">{t("svc.name")}</span><input className="input" name="name" required minLength={2} maxLength={80} defaultValue={offering?.name} /></label>
      <div className="kpis">
        <label className="field"><span className="label">{t("svc.delivery")}</span>
          <select className="input" name="delivery" value={delivery} onChange={(e) => setDelivery(e.target.value)}>
            {DELIVERY.map((d) => <option key={d} value={d}>{t(`delivery.${d}` as MessageKey)}</option>)}</select></label>
        <label className="field"><span className="label">{t("svc.billing")}</span>
          <select className="input" name="billing" value={billing} onChange={(e) => setBilling(e.target.value)}>
            {BILLING.map((b) => <option key={b} value={b}>{t(`billing.${b}` as MessageKey)}</option>)}</select></label>
        <label className="field"><span className="label">{t("svc.price")}</span><input className="input input-ltr" name="price" inputMode="decimal" required defaultValue={offering ? offering.price_agorot / 100 : ""} /></label>
        {(delivery === "addon" || delivery === "product") && <p className="small row" style={{ margin: 0, background: "var(--accent-soft)", padding: 10, borderRadius: 10, alignItems: "start" }}><Icon n="info" size={16} /><span>{t("svc.addon.hint")}</span></p>}
        {timed && <label className="field"><span className="label">{t("svc.minutes")}</span><input className="input input-ltr" name="minutes" type="number" min={5} max={600} required defaultValue={offering?.minutes ?? 60} /></label>}
        {billing === "pack" && (delivery === "class" || delivery === "appointment") && <label className="field"><span className="label">{t("svc.entries")}</span><input className="input input-ltr" name="entries" type="number" min={1} max={200} required defaultValue={offering?.pack_entries ?? 10} /></label>}
        {(billing === "pack" || billing === "subscription") && (delivery === "class" || delivery === "appointment") && <label className="field"><span className="label">{t("svc.valid_days")}</span><input className="input input-ltr" name="valid_days" type="number" min={1} max={730} defaultValue={offering?.valid_days ?? (billing === "pack" ? 90 : 30)} /></label>}
        {delivery === "appointment" && <label className="field"><span className="label">{t("svc.deposit")}</span><input className="input input-ltr" name="deposit" inputMode="decimal" defaultValue={offering?.deposit_agorot ? offering.deposit_agorot / 100 : ""} /></label>}
        {delivery === "appointment" && <label className="field"><span className="label">{t("svc.buffer")}</span><input className="input input-ltr" name="buffer" type="number" min={0} max={120} defaultValue={offering?.buffer_minutes ?? 0} /></label>}
      </div>
      <label className="check"><input type="checkbox" name="active" defaultChecked={offering?.active ?? true} /> {t("svc.active")}</label>
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <div className="row">
        <button className="btn btn-primary btn-small" disabled={pending}><Icon n="check" />{pending ? t("svc.saving") : t("svc.save")}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>{t("svc.cancel")}</button>
      </div>
    </form>
  );
}
