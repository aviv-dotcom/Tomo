import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate, fmtTime } from "@/lib/time";

const t = translator("he");
export type ActionKind = "booking_confirm" | "reminder_24h" | "no_show" | "missed_you" | "session_cancelled" | "deletion_request";
export type Action = { id: string; kind: ActionKind; created_at: string; data: { offering?: string; starts_at?: string; location?: string | null; token?: string; reason?: string | null };
  person: { id: string; name: string; phone: string | null } };

/** Writes the message for an action from its facts. The owner can still edit it before sending. */
export function compose(a: Action, ctx: { business: string; timezone: string; pageUrl: string | null; base: string }): string {
  if (a.kind === "deletion_request") return "";
  const first = a.person.name.split(" ")[0];
  const values: Record<string, string> = {
    name: first, business: ctx.business, offering: a.data.offering ?? "",
    date: a.data.starts_at ? fmtDate(a.data.starts_at, ctx.timezone) : "",
    time: a.data.starts_at ? fmtTime(a.data.starts_at, ctx.timezone) : "",
    location: a.data.location ? `, ${a.data.location}` : "",
    link: ctx.pageUrl ? ` ${ctx.pageUrl}` : "",
    reason: a.data.reason ? ` (${a.data.reason})` : "",
  };
  const text = t(`msg.${a.kind}` as MessageKey).replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
  // Confirmations and reminders carry the client's private link to change or cancel (and fill the health form).
  if ((a.kind === "booking_confirm" || a.kind === "reminder_24h") && a.data.token && ctx.base) {
    return text + t("msg.manage").replace("{url}", `${ctx.base}/m/${a.data.token}`);
  }
  return text;
}
