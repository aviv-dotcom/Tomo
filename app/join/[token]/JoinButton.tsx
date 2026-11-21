"use client";
import { useActionState } from "react";
import { translator } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
import { acceptInvite, type JoinState } from "./actions";

const t = translator("he");

export function JoinButton({ token }: { token: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(acceptInvite, null);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input type="hidden" name="token" value={token} />
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <button className="btn btn-primary" disabled={pending}><Icon n="check" />{t("join.accept")}</button>
    </form>
  );
}
