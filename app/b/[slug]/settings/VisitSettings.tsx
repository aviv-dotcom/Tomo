"use client";
import { useState, useTransition } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { Title } from "@/components/Icon";
import { setModule } from "./actions";

const t = translator("he");
const KEYS = ["visit_summary", "before_after", "recommendations"] as const;

/** Owner switches for what a visit card includes. Before/after and recommendations live inside the summary. */
export function VisitSettings({ business, slug, modules }: { business: string; slug: string; modules: string[] }) {
  const [on, setOn] = useState(() => new Set(modules));
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  function toggle(key: string, value: boolean) {
    const next = new Set(on); if (value) next.add(key); else next.delete(key); setOn(next);
    const fd = new FormData(); fd.set("business", business); fd.set("slug", slug); fd.set("module", key); fd.set("on", value ? "1" : "");
    start(async () => { const r = await setModule(fd); if (r?.error) { setError(r.error); setOn(on); } else setError(null); });
  }
  return (
    <section className="card" style={{ gap: 0 }}>
      <Title n="clipboard" style={{ marginBottom: 2 }}>{t("set.visits")}</Title>
      <p className="muted small" style={{ margin: "0 0 4px" }}>{t("set.visits.hint")}</p>
      {KEYS.map((k) => {
        const inner = k !== "visit_summary";
        const disabled = pending || (inner && !on.has("visit_summary"));
        return (
          <label key={k} className="list-row" style={{ cursor: disabled ? "default" : "pointer", paddingInlineStart: inner ? 18 : 0, opacity: inner && !on.has("visit_summary") ? 0.5 : 1 }}>
            <span className="grow"><span>{t(`mod.${k}` as MessageKey)}</span><span className="muted small">{t(`mod.${k}.hint` as MessageKey)}</span></span>
            <input type="checkbox" className="switch" checked={on.has(k)} disabled={disabled} onChange={(e) => toggle(k, e.target.checked)} aria-label={t(`mod.${k}` as MessageKey)} data-module={k} />
          </label>
        );
      })}
      {error && <span className="error">{t(error)}</span>}
    </section>
  );
}
