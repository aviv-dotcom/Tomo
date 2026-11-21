import type { Metadata } from "next";
import Link from "next/link";
import { anonSupabase } from "@/lib/supabase/anon";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate } from "@/lib/time";
import { Icon, IconTile } from "@/components/Icon";
import { LeaveButton } from "./LeaveButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
const t = translator("he");

/** The client's own waitlist entry: see it, book another time, or leave. */
export default async function WaitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = /^[0-9a-f-]{36}$/i.test(token) ? await anonSupabase().rpc("public_waitlist_info", { p_token: token }) : { data: null };
  const w = data as { business: string; slug: string; timezone: string; offering: string; offering_id: string; date: string; part: string; status: string } | null;
  if (!w) return <main className="page" style={{ paddingTop: 56 }}><IconTile n="search" size={56} tone="plain" /><h1 className="h1">{t("m.notfound")}</h1></main>;
  const waiting = w.status === "waiting";
  return (
    <main className="page" style={{ paddingTop: 40 }}>
      <span className="muted small">{w.business}</span>
      <h1 className="h1">{t("wait.title")}</h1>
      <section className="card">
        <b style={{ fontSize: 18 }}>{w.offering}</b>
        <span className="meta"><Icon n="calendar" size={16} />{fmtDate(`${w.date}T12:00:00Z`, w.timezone)} · {t(`part.${w.part}` as MessageKey)}</span>
        <span className={`tag ${waiting ? "tag-good" : "tag-warn"}`} style={{ alignSelf: "flex-start" }}>{waiting ? t("wl.status.waiting") : w.status === "booked" ? t("wl.status.booked") : t("wl.status.left")}</span>
      </section>
      {waiting && <p className="sub">{t("wait.done.body")}</p>}
      <Link className="btn btn-primary" href={`/p/${w.slug}/book?o=${w.offering_id}&d=${w.date}`}><Icon n="calendarPlus" />{t("wl.book")}</Link>
      {waiting && <LeaveButton token={token} />}
    </main>
  );
}
