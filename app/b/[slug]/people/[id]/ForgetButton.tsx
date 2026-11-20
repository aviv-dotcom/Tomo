"use client";
import { translator } from "@/lib/i18n";
import { forgetPerson } from "./actions";

const t = translator("he");

export function ForgetButton({ id, slug }: { id: string; slug: string }) {
  return (
    <form action={forgetPerson} onSubmit={(e) => { if (!confirm(t("card.forget.confirm"))) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="slug" value={slug} />
      <button className="btn btn-secondary btn-small" style={{ color: "var(--bad)" }}>{t("card.forget")}</button>
    </form>
  );
}
