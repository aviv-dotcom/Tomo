import { type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { isDate } from "@/lib/time";

const t = translator("he");

/** CSV files for a spreadsheet or the accountant. Row Level Security limits them to the signed-in staff's own business. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { data: biz } = await sb.from("businesses").select("id, timezone").eq("slug", slug).maybeSingle();
  if (!biz) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined, to = url.searchParams.get("to") ?? undefined;
  const tz = biz.timezone as string;
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  const money = (a: number) => (a / 100).toFixed(2);
  let rows: (string | number | null)[][] = [];
  if (kind === "clients") {
    const { data } = await sb.from("people").select("full_name, phone, email, status, source, marketing_consent, created_at").eq("business_id", biz.id).is("forgotten_at", null).order("created_at");
    rows = [[t("card.name"), t("card.phone"), t("card.email"), t("card.status"), t("exp.source"), t("exp.marketing"), t("exp.since")],
      ...(data ?? []).map((p) => [p.full_name, p.phone, p.email, t(`status.${p.status}` as MessageKey), p.source, p.marketing_consent ? t("form.yes") : t("form.no"), day(p.created_at)])];
  } else if (kind === "payments" || kind === "charges") {
    if (!isDate(from) || !isDate(to)) return new Response("Bad range", { status: 400 });
    const lo = new Date(`${from}T00:00:00Z`).getTime() - 3 * 3600e3, hi = new Date(`${to}T23:59:59Z`).getTime() + 3 * 3600e3;
    if (kind === "payments") {
      const { data } = await sb.from("payments").select("amount_agorot, method, note, paid_at, people(full_name)").eq("business_id", biz.id)
        .gte("paid_at", new Date(lo).toISOString()).lte("paid_at", new Date(hi).toISOString()).order("paid_at");
      rows = [[t("exp.date"), t("card.name"), t("money.amount"), t("money.method"), t("money.note")],
        ...((data ?? []) as unknown as { amount_agorot: number; method: string; note: string | null; paid_at: string; people: { full_name: string } | null }[])
          .filter((p) => day(p.paid_at) >= from && day(p.paid_at) <= to)
          .map((p) => [day(p.paid_at), p.people?.full_name ?? "", money(p.amount_agorot), t(`method.${p.method}` as MessageKey), p.note])];
    } else {
      const { data } = await sb.from("charges").select("amount_agorot, description, void, created_at, people(full_name)").eq("business_id", biz.id)
        .gte("created_at", new Date(lo).toISOString()).lte("created_at", new Date(hi).toISOString()).order("created_at");
      rows = [[t("exp.date"), t("card.name"), t("money.charge.desc"), t("money.amount"), t("exp.void")],
        ...((data ?? []) as unknown as { amount_agorot: number; description: string; void: boolean; created_at: string; people: { full_name: string } | null }[])
          .filter((c) => day(c.created_at) >= from && day(c.created_at) <= to)
          .map((c) => [day(c.created_at), c.people?.full_name ?? "", c.description, money(c.amount_agorot), c.void ? t("form.yes") : ""])];
    }
  } else return new Response("Not found", { status: 404 });
  const cell = (v: string | number | null) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
  // A byte-order mark so Excel opens Hebrew correctly.
  const body = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  const name = `${slug}-${kind}${from && kind !== "clients" ? `-${from}-${to}` : ""}.csv`;
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
