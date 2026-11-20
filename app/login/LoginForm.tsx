"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

const t = translator("he");

export function LoginForm({ failed }: { failed: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<MessageKey | null>(failed ? "login.error.callback" : null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.status === 429 ? "login.error.rate" : "login.error");
    else setSent(true);
  }

  if (sent) {
    return (
      <main className="page" style={{ paddingTop: 56 }}>
        <h1 className="h1">{t("login.sent.title")}</h1>
        <p className="sub">{t("login.sent.body")}</p>
        <p className="muted input-ltr" style={{ textAlign: "start" }}>{email}</p>
        <button className="btn btn-secondary" onClick={() => setSent(false)}>{t("login.again")}</button>
      </main>
    );
  }
  return (
    <main className="page" style={{ paddingTop: 56 }}>
      <h1 className="h1">{t("login.title")}</h1>
      <p className="sub">{t("login.subtitle")}</p>
      <form onSubmit={send} className="card">
        <label className="field">
          <span className="label">{t("login.email")}</span>
          <input className="input input-ltr" type="email" required autoComplete="email" inputMode="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{t(error)}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? t("login.sending") : t("login.send")}</button>
      </form>
    </main>
  );
}
