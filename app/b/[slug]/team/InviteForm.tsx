"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { translator } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
import { inviteMember, type TeamState } from "./actions";

const t = translator("he");

export function InviteForm({ business, slug, businessName }: { business: string; slug: string; businessName: string }) {
  const [state, action, pending] = useActionState<TeamState, FormData>(inviteMember, null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => { if (state?.token) { form.current?.reset(); setCopied(false); } }, [state?.token]);
  const link = state?.token ? `${origin}/join/${state.token}` : "";
  const message = t("team.invite.msg").replace("{business}", businessName).replace("{link}", link);
  return (
    <form ref={form} action={action} className="card" style={{ gap: 10 }}>
      <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
      <label className="field"><span className="label">{t("team.invite.email")}</span>
        <input className="input input-ltr" name="email" type="email" required autoComplete="off" /></label>
      <p className="muted small" style={{ margin: 0 }}>{t("team.invite.hint")}</p>
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <button className="btn btn-primary btn-small" disabled={pending}><Icon n="userPlus" />{t("team.invite")}</button>
      {state?.token && (
        <div className="action">
          <b className="small">{t("team.invite.ready")}</b>
          <span className="input-ltr small" style={{ textAlign: "start", wordBreak: "break-all" }}>{link}</span>
          <div className="row btn-row">
            <a className="btn btn-primary btn-small" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><Icon n="send" />{t("act.send")}</a>
            <button type="button" className="btn btn-secondary btn-small" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}><Icon n={copied ? "check" : "copy"} />{copied ? t("site.copied") : t("sync.copy")}</button>
          </div>
        </div>
      )}
    </form>
  );
}
