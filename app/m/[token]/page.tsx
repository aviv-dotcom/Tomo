import type { Metadata } from "next";
import Link from "next/link";
import { getForm, getManaged } from "@/lib/manage";
import { translator } from "@/lib/i18n";
import { whatsappLink } from "@/lib/format";
import { fmtDate, fmtTime } from "@/lib/time";
import { ClientActions } from "./ClientActions";
import { AddToCalendar } from "@/components/AddToCalendar";
import { Icon, IconTile } from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
const t = translator("he");

export default async function ManagePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ moved?: string }> }) {
  const { token } = await params;
  const { moved } = await searchParams;
  const b = await getManaged(token);
  if (!b) return <main className="page" style={{ paddingTop: 56 }}><IconTile n="search" size={56} tone="plain" /><h1 className="h1">{t("m.notfound")}</h1></main>;
  const form = await getForm(token);
  const tz = b.business.timezone;
  const past = new Date(b.starts_at) < new Date();
  const active = (b.status === "booked" || b.status === "waitlist") && b.session_status === "scheduled" && !past;
  const status = b.status === "cancelled" ? (b.cancelled_by === "business" ? t("m.cancelled.business") : t("m.cancelled"))
    : past ? t("m.past") : b.status === "waitlist" ? t("m.waitlist") : t("m.booked");
  return (
    <main className="page" style={{ paddingBottom: 40 }}>
      <span className="muted small">{b.business.name}</span>
      <h1 className="h1">{t("today.hello")} {b.first_name}</h1>
      {moved && <p className="tag tag-good" role="status" style={{ alignSelf: "flex-start" }}><Icon n="check" size={14} />{t("m.moved")}</p>}
      <section className="card">
        <span className="muted small">{t("m.title")}</span>
        <b style={{ fontSize: 18 }}>{b.offering.name}</b>
        <span className="meta"><Icon n="calendar" size={16} />{fmtDate(b.starts_at, tz)}</span>
        <span className="meta"><Icon n="clock" size={16} />{fmtTime(b.starts_at, tz)}</span>
        {b.location && <span className="meta"><Icon n="pin" size={16} />{b.location}</span>}
        <span className={`tag ${active ? "tag-good" : "tag-warn"}`} style={{ alignSelf: "flex-start" }}>{status}</span>
      </section>
      {active && form?.enabled && (
        form.signed ? <p className="muted small meta"><Icon n="check" size={15} />{t("m.form.done")}</p>
          : <Link className="btn btn-primary" href={`/m/${token}/form`}><Icon n="clipboard" />{t("m.form")}</Link>
      )}
      {active && (b.can_change
        ? <ClientActions token={token} />
        : <p className="muted small">{t("m.too_late").replace("{hours}", String(b.cancel_hours))}</p>)}
      {!active && b.business.page && <Link className="btn btn-primary" href={`/p/${b.business.slug}`}><Icon n="calendarPlus" />{t("m.book_again")}</Link>}
      {active && <AddToCalendar icsHref={`/m/${token}/ics`} ev={{ title: `${b.offering.name} · ${b.business.name}`, start: b.starts_at,
        end: new Date(new Date(b.starts_at).getTime() + (b.offering.minutes ?? 60) * 60000).toISOString(), location: b.location }} />}
      {b.business.whatsapp && <a className="btn btn-secondary" href={whatsappLink(b.business.whatsapp)} target="_blank" rel="noopener noreferrer"><Icon n="chat" />{t("m.contact")}</a>}
      <details className="card">
        <summary className="card-title" style={{ cursor: "pointer" }}><span className="title-in"><Icon n="shield" className="title-icon" />{t("m.data")}</span></summary>
        <a className="btn btn-secondary btn-small" href={`/m/${token}/export`}><Icon n="download" />{t("m.data.copy")}</a>
        <ClientActions token={token} deletionOnly />
      </details>
    </main>
  );
}
