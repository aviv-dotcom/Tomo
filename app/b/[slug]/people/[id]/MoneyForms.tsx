"use client";
import { useActionState, useEffect, useRef } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { addCharge, recordPayment, type MoneyState } from "../../money/actions";
import { Icon } from "@/components/Icon";

const t = translator("he");
const METHODS = ["cash", "bit", "transfer", "card", "other", "refund"] as const;

export function PaymentForm({ business, slug, person, suggested, canRefund = true }: { business: string; slug: string; person: string; suggested: number; canRefund?: boolean }) {
  const [state, action, pending] = useActionState<MoneyState, FormData>(recordPayment, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state?.ok]);
  return (
    <form ref={form} action={action} className="action">
      <b className="title-in"><Icon n="money" className="title-icon" />{t("money.pay.title")}</b>
      <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="person" value={person} />
      <div className="kpis">
        <input className="input input-ltr" name="amount" inputMode="decimal" required placeholder={t("money.amount")} aria-label={t("money.amount")} defaultValue={suggested > 0 ? suggested / 100 : ""} />
        <select className="input" name="method" aria-label={t("money.method")}>{METHODS.filter((m) => canRefund || m !== "refund").map((m) => <option key={m} value={m}>{t(`method.${m}` as MessageKey)}</option>)}</select>
      </div>
      <input className="input" name="note" maxLength={120} placeholder={t("money.note")} aria-label={t("money.note")} />
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <button className="btn btn-primary btn-small" disabled={pending}><Icon n="check" />{pending ? t("money.saving") : t("money.pay.save")}</button>
    </form>
  );
}

export function ChargeForm({ business, slug, person }: { business: string; slug: string; person: string }) {
  const [state, action, pending] = useActionState<MoneyState, FormData>(addCharge, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state?.ok]);
  return (
    <form ref={form} action={action} className="action">
      <b className="title-in"><Icon n="receipt" className="title-icon" />{t("money.charge.title")}</b>
      <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="person" value={person} />
      <input className="input" name="description" required minLength={2} maxLength={120} placeholder={t("money.charge.desc")} aria-label={t("money.charge.desc")} />
      <input className="input input-ltr" name="amount" inputMode="decimal" required placeholder={t("money.amount")} aria-label={t("money.amount")} />
      {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
      <button className="btn btn-secondary btn-small" disabled={pending}><Icon n="plus" />{pending ? t("money.saving") : t("money.charge.save")}</button>
    </form>
  );
}
