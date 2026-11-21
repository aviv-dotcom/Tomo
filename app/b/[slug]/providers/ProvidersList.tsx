"use client";
import { useCallback, useState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { minToTime } from "@/lib/time";
import { Icon } from "@/components/Icon";
import { ProviderForm, type Provider } from "./ProviderForm";

const t = translator("he");

export function ProvidersList({ business, slug, providers, offerings }: { business: string; slug: string; providers: Provider[]; offerings: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const summary = (p: Provider) => [
    p.offerings ? offerings.filter((o) => p.offerings!.includes(o.id)).map((o) => o.name).join(", ") : t("prov.services.all"),
    p.hours ? p.hours.map((h) => `${t(`dayShort.${h.weekday}` as MessageKey)} ${minToTime(h.start)}–${minToTime(h.end)}`).join(" · ") : t("prov.hours.business.short"),
  ];
  return (
    <>
      <section className="card" style={{ gap: 0 }}>
        {providers.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("prov.empty")}</p>}
        {providers.map((p) => editing === p.id ? (
          <ProviderForm key={p.id} business={business} slug={slug} offerings={offerings} provider={p} onDone={close} />
        ) : (
          <button key={p.id} type="button" className="list-row link-row" onClick={() => setEditing(p.id)}
            style={{ width: "100%", background: "none", border: 0, borderBottom: "1px solid var(--line)", textAlign: "start", cursor: "pointer", opacity: p.active ? 1 : 0.5 }}>
            <span className="avatar" style={{ background: p.color, color: "#fff" }}>{p.name.slice(0, 1)}</span>
            <span className="grow"><b>{p.name}</b>{summary(p).map((x, i) => <span key={i} className="muted small">{x}</span>)}</span>
            {!p.active && <span className="tag tag-warn">{t("prov.off")}</span>}
            <Icon n="edit" size={16} className="chev" />
          </button>
        ))}
      </section>
      {editing === "new" ? <ProviderForm business={business} slug={slug} offerings={offerings} onDone={close} />
        : <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}><Icon n="userPlus" />{t("prov.add")}</button>}
    </>
  );
}
