import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate, fmtTime } from "@/lib/time";

const t = translator("he");
export type ActionKind = "booking_confirm" | "reminder_24h" | "no_show" | "missed_you";
export type Action = { id: string; kind: ActionKind; created_at: string; data: { offering?: string; starts_at?: string; location?: string | null };
  person: { id: string; name: string; phone: string | null } };

/** Writes the message for an action from its facts. The owner can still edit it before sending. */
export function compose(a: Action, ctx: { business: string; timezone: string; pageUrl: string | null }): string {
  const first = a.person.name.split(" ")[0];
  const values: Record<string, string> = {
    name: first, business: ctx.business, offering: a.data.offering ?? "",
    date: a.data.starts_at ? fmtDate(a.data.starts_at, ctx.timezone) : "",
    time: a.data.starts_at ? fmtTime(a.data.starts_at, ctx.timezone) : "",
    location: a.data.location ? `, ${a.data.location}` : "",
    link: ctx.pageUrl ? ` ${ctx.pageUrl}` : "",
  };
  return t(`msg.${a.kind}` as MessageKey).replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
}
