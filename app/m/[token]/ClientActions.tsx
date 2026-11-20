"use client";
import Link from "next/link";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import { clientCancel, clientRequestDeletion, type MState } from "./actions";
import { Icon } from "@/components/Icon";

const t = translator("he");

export function ClientActions({ token, deletionOnly }: { token: string; deletionOnly?: boolean }) {
  const [cState, cancel, cPending] = useActionState<MState, FormData>(clientCancel, null);
  const [dState, del, dPending] = useActionState<MState, FormData>(clientRequestDeletion, null);
  if (deletionOnly) {
    return dState?.ok ? <p className="muted small" role="status"><Icon n="check" size={15} />{t("m.data.requested")}</p> : (
      <form action={del} onSubmit={(e) => { if (!confirm(t("m.data.delete.confirm"))) e.preventDefault(); }}>
        <input type="hidden" name="token" value={token} />
        {dState?.error && <p className="error">{t(dState.error)}</p>}
        <button className="btn btn-secondary btn-small" style={{ color: "var(--bad)" }} disabled={dPending}><Icon n="trash" />{t("m.data.delete")}</button>
      </form>
    );
  }
  return (
    <div className="row btn-row">
      <Link className="btn btn-secondary" style={{ flex: 1 }} href={`/m/${token}/move`}><Icon n="repeat" />{t("m.move")}</Link>
      <form action={cancel} style={{ flex: 1, display: "flex" }} onSubmit={(e) => { if (!confirm(t("m.cancel.confirm"))) e.preventDefault(); }}>
        <input type="hidden" name="token" value={token} />
        <button className="btn btn-secondary" style={{ flex: 1, color: "var(--bad)" }} disabled={cPending}><Icon n="ban" />{t("m.cancel")}</button>
      </form>
      {cState?.error && <p className="error" role="alert">{t(cState.error)}</p>}
    </div>
  );
}
