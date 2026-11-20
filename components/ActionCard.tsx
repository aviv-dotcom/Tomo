"use client";
import { useState, useTransition } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { whatsappLink } from "@/lib/format";
import type { Action } from "@/lib/compose";
import { resolveAction } from "@/app/b/[slug]/inbox/actions";

const t = translator("he");

/** One prepared message. Sending opens WhatsApp with the text ready; nothing is sent without the owner's tap. */
export function ActionCard({ action, text, slug }: { action: Action; text: string; slug: string }) {
  const [body, setBody] = useState(text);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return null;
  const finish = (status: "sent" | "dismissed") => start(async () => { await resolveAction(action.id, status, slug); setDone(true); });
  const phone = action.person.phone;
  return (
    <div className="action">
      <div className="row"><span className="grow"><b>{action.person.name}</b><span className="muted small">{t(`act.${action.kind}` as MessageKey)}</span></span></div>
      <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} aria-label={action.person.name} style={{ padding: 10, lineHeight: 1.5 }} />
      {!phone && <span className="muted small">{t("act.nophone")}</span>}
      <div className="row">
        {phone && (
          <a className="btn btn-primary btn-small" href={whatsappLink(phone, body)} target="_blank" rel="noopener noreferrer"
            onClick={() => finish("sent")} aria-disabled={pending}>{t("act.send")}</a>
        )}
        <button className="btn btn-secondary btn-small" disabled={pending} onClick={() => finish("dismissed")}>{t("act.skip")}</button>
      </div>
    </div>
  );
}
