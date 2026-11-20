"use client";
import { useOptimistic, useTransition } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { toggleAutomation } from "../inbox/actions";

const t = translator("he");
const KEYS = ["booking_confirm", "reminder_24h", "no_show", "missed_you"] as const;

export function Toggles({ business, slug, state }: { business: string; slug: string; state: Record<string, boolean> }) {
  const [opt, setOpt] = useOptimistic(state, (s, u: { k: string; v: boolean }) => ({ ...s, [u.k]: u.v }));
  const [, start] = useTransition();
  return (
    <section className="card" style={{ gap: 0 }}>
      {KEYS.map((k) => (
        <label key={k} className="list-row" style={{ cursor: "pointer" }}>
          <span className="grow"><b>{t(`auto.${k}` as MessageKey)}</b><span className="muted small">{t(`auto.${k}.desc` as MessageKey)}</span></span>
          <input type="checkbox" className="switch" checked={!!opt[k]} aria-label={t(`auto.${k}` as MessageKey)}
            onChange={(e) => { const v = e.target.checked; start(async () => { setOpt({ k, v }); await toggleAutomation(business, k, v, slug); }); }} />
        </label>
      ))}
    </section>
  );
}
