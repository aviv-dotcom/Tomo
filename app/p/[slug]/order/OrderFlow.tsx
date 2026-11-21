"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { translator } from "@/lib/i18n";
import { shekels } from "@/lib/format";
import { Back, Icon, Title } from "@/components/Icon";
import { publicOrder, type OrderState } from "../book/actions";

const t = translator("he");
type Product = { id: string; name: string; priceAgorot: number };

export function OrderFlow({ slug, name, accent, products, start }: { slug: string; name: string; accent: string | null; products: Product[]; start: string | null }) {
  const [state, action, pending] = useActionState<OrderState, FormData>(publicOrder, null);
  const [qty, setQty] = useState<Record<string, number>>(start ? { [start]: 1 } : {});
  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(20, n)) }));
  const lines = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const total = lines.reduce((s, p) => s + p.priceAgorot * qty[p.id], 0);
  const style = accent ? ({ "--accent": accent, "--accent-soft": `color-mix(in srgb, ${accent} 13%, var(--surface))` } as React.CSSProperties) : undefined;

  if (state?.done) {
    return (
      <main className="page" style={{ paddingTop: 48, ...style }}>
        <span className="hero-mark" style={{ background: "var(--good)" }} aria-hidden="true"><Icon n="check" size={32} /></span>
        <h1 className="h1">{t("order.done.title")}</h1>
        <div className="card">
          {state.done.items.map((i) => <span key={i.name}>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ""}</span>)}
          <b>{t("pubbook.total")}: {shekels(state.done.total)}</b>
          <span className="muted">{name}</span>
        </div>
        <p className="sub">{t("order.done.body")}</p>
        <Link className="btn btn-secondary" href={`/p/${slug}`}>{t("pubbook.done.back")}</Link>
      </main>
    );
  }
  return (
    <main className="page" style={{ paddingBottom: 40, ...style }}>
      <Back href={`/p/${slug}`} label={name} />
      <h1 className="h1">{t("order.title")}</h1>
      <p className="sub">{t("order.sub")}</p>
      <section className="card" style={{ gap: 0 }}>
        <Title n="tag" style={{ marginBottom: 6 }}>{t("order.products")}</Title>
        {products.map((p) => (
          <div key={p.id} className="list-row">
            <span className="grow"><span>{p.name}</span><span className="muted small">{shekels(p.priceAgorot)}</span></span>
            <div className="stepper">
              <button type="button" className="icon-btn" onClick={() => set(p.id, (qty[p.id] ?? 0) - 1)} disabled={!qty[p.id]} aria-label={t("order.less")}>−</button>
              <span aria-live="polite">{qty[p.id] ?? 0}</span>
              <button type="button" className="icon-btn" onClick={() => set(p.id, (qty[p.id] ?? 0) + 1)} aria-label={t("order.more")}><Icon n="plus" size={16} /></button>
            </div>
          </div>
        ))}
      </section>
      <form action={action} className="card" style={{ gap: 12 }}>
        <Title n="user">{t("pubbook.details")}</Title>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="items" value={JSON.stringify(lines.map((p) => ({ id: p.id, qty: qty[p.id] })))} />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp" />
        <label className="field"><span className="label">{t("pubbook.name")}</span><input className="input" name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>
        <label className="field"><span className="label">{t("pubbook.phone")}</span><input className="input input-ltr" name="phone" type="tel" required inputMode="tel" autoComplete="tel" /></label>
        <label className="field"><span className="label">{t("order.note")}</span><input className="input" name="note" maxLength={300} /></label>
        <label className="check"><input type="checkbox" name="marketing" /> {t("pubbook.marketing")}</label>
        {lines.length > 0 && <div className="summary"><span className="grow"><b>{lines.map((p) => `${p.name}${qty[p.id] > 1 ? ` ×${qty[p.id]}` : ""}`).join(" + ")}</b></span><span className="price">{shekels(total)}</span></div>}
        {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
        <button className="btn btn-primary" disabled={pending || lines.length === 0}><Icon n="send" />{pending ? t("pubbook.sending") : t("order.submit")}</button>
        <p className="muted small row" style={{ margin: 0 }}><Icon n="shield" size={15} />{t("pubbook.privacy")}</p>
      </form>
    </main>
  );
}
