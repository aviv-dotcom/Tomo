"use client";
import { useState, useTransition } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { whatsappLink } from "@/lib/format";
import type { Action } from "@/lib/compose";
import { forgetFromRequest, resolveAction } from "@/app/b/[slug]/inbox/actions";
import { Icon, IconTile, type IconName } from "@/components/Icon";

const t = translator("he");
const KIND_ICON: Record<string, IconName> = { booking_confirm: "check", reminder_24h: "bell", no_show: "ban", missed_you: "heart", session_cancelled: "calendarOff" };

/** One prepared message. Sending opens WhatsApp with the text ready; nothing is sent without the owner's tap. */
export function ActionCard({ action, text, slug }: { action: Action; text: string; slug: string }) {
  const [body, setBody] = useState(text);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return null;
  const finish = (status: "sent" | "dismissed") => start(async () => { await resolveAction(action.id, status, slug); setDone(true); });
  const phone = action.person.phone;
  if (action.kind === "deletion_request") {
    return (
      <div className="action">
        <div className="row"><IconTile n="trash" tone="bad" size={34} /><span className="grow"><b>{action.person.name}</b><span className="muted small">{t("act.deletion_request")}</span></span></div>
        <p className="small" style={{ margin: 0, lineHeight: 1.5 }}>{t("act.deletion_body")}</p>
        <div className="row">
          <button className="btn btn-primary btn-small" disabled={pending}
            onClick={() => { if (confirm(t("card.forget.confirm"))) start(async () => { await forgetFromRequest(action.id, action.person.id, slug); setDone(true); }); }}><Icon n="trash" />{t("act.delete_now")}</button>
          <button className="btn btn-secondary btn-small" disabled={pending} onClick={() => finish("dismissed")}><Icon n="x" />{t("act.reject")}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="action">
      <div className="row"><IconTile n={KIND_ICON[action.kind] ?? "chat"} tone={action.kind === "session_cancelled" || action.kind === "no_show" ? "warn" : "accent"} size={34} /><span className="grow"><b>{action.person.name}</b><span className="muted small">{t(`act.${action.kind}` as MessageKey)}</span></span></div>
      {action.data.typed_name && <p className="small row" style={{ margin: 0, background: "var(--warn-soft)", padding: 8, borderRadius: 8, alignItems: "start" }}><Icon n="info" size={15} /><span>{t("act.typed_name").replace("{name}", action.data.typed_name)}</span></p>}
      <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} aria-label={action.person.name} style={{ padding: 10, lineHeight: 1.5 }} />
      {!phone && <span className="muted small">{t("act.nophone")}</span>}
      <div className="row">
        {phone && (
          <a className="btn btn-primary btn-small" href={whatsappLink(phone, body)} target="_blank" rel="noopener noreferrer"
            onClick={() => finish("sent")} aria-disabled={pending}><Icon n="send" />{t("act.send")}</a>
        )}
        <button className="btn btn-secondary btn-small" disabled={pending} onClick={() => finish("dismissed")}><Icon n="x" />{t("act.skip")}</button>
      </div>
    </div>
  );
}
