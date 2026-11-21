"use client";
import { translator } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
import { leaveWaitlist } from "./actions";

const t = translator("he");

export function LeaveButton({ token }: { token: string }) {
  return (
    <form action={leaveWaitlist} onSubmit={(e) => { if (!confirm(t("wl.leave.confirm"))) e.preventDefault(); }}>
      <input type="hidden" name="token" value={token} />
      <button className="btn btn-secondary" style={{ width: "100%", color: "var(--bad)" }}><Icon n="x" />{t("wl.leave")}</button>
    </form>
  );
}
