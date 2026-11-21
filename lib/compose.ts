import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate, fmtTime } from "@/lib/time";

const t = translator("he");
export type ActionKind = "booking_confirm" | "reminder_24h" | "no_show" | "missed_you" | "session_cancelled" | "deletion_request" | "waitlist_offer" | "waitlist_promoted" | "pass_ending" | "new_order";
export type Action = { id: string; kind: ActionKind; created_at: string; data: { offering?: string; starts_at?: string; location?: string | null; token?: string; reason?: string | null; addons?: string[]; typed_name?: string | null; new?: boolean; offering_id?: string; date?: string; waitlist_id?: string; pass?: string; left?: number | null; expires_on?: string | null; items?: string[]; total?: number };
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
    pass: a.data.pass ?? "",
    passleft: a.data.left == null ? "" : a.data.left === 1 ? t("msg.pass.one") : a.data.left === 0 ? t("msg.pass.none") : t("msg.pass.left").replace("{n}", String(a.data.left)),
    until: a.data.expires_on ? t("msg.pass.until").replace("{date}", fmtDate(`${a.data.expires_on}T12:00:00Z`, ctx.timezone)) : "",
    items: a.data.items?.join(", ") ?? "",
    addons: a.data.addons?.length ? ` + ${a.data.addons.join(" + ")}` : "",
    // A link straight to booking that service on that day.
    book: ctx.pageUrl && a.data.offering_id ? ` ${ctx.pageUrl}/book?o=${a.data.offering_id}${a.data.date ? `&d=${a.data.date}` : ""}` : "",
  };
  const text = t(`msg.${a.kind}` as MessageKey).replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
  // Confirmations and reminders carry the client's private link to change or cancel (and fill the health form).
  if ((a.kind === "booking_confirm" || a.kind === "reminder_24h" || a.kind === "waitlist_promoted") && a.data.token && ctx.base) {
    return text + t("msg.manage").replace("{url}", `${ctx.base}/m/${a.data.token}`);
  }
  return text;
}
