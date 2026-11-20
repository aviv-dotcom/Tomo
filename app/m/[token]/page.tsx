import type { Metadata } from "next";
import Link from "next/link";
import { getForm, getManaged } from "@/lib/manage";
import { translator } from "@/lib/i18n";
import { whatsappLink } from "@/lib/format";
import { fmtDate, fmtTime } from "@/lib/time";
import { ClientActions } from "./ClientActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
const t = translator("he");

export default async function ManagePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ moved?: string }> }) {
  const { token } = await params;
  const { moved } = await searchParams;
  const b = await getManaged(token);
  if (!b) return <main className="page" style={{ paddingTop: 56 }}><h1 className="h1">{t("m.notfound")}</h1></main>;
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
      {moved && <p className="tag tag-good" role="status" style={{ alignSelf: "flex-start" }}>✓ {t("m.moved")}</p>}
      <section className="card">
        <span className="muted small">{t("m.title")}</span>
        <b style={{ fontSize: 18 }}>{b.offering.name}</b>
        <span>{fmtDate(b.starts_at, tz)} · {fmtTime(b.starts_at, tz)}{b.location ? ` · ${b.location}` : ""}</span>
        <span className={`tag ${active ? "tag-good" : "tag-warn"}`} style={{ alignSelf: "flex-start" }}>{status}</span>
      </section>
      {active && form?.enabled && (
        form.signed ? <p className="muted small">✓ {t("m.form.done")}</p>
          : <Link className="btn btn-primary" href={`/m/${token}/form`}>{t("m.form")}</Link>
      )}
      {active && (b.can_change
        ? <ClientActions token={token} />
        : <p className="muted small">{t("m.too_late").replace("{hours}", String(b.cancel_hours))}</p>)}
      {!active && b.business.page && <Link className="btn btn-primary" href={`/p/${b.business.slug}`}>{t("m.book_again")}</Link>}
      {b.business.whatsapp && <a className="btn btn-secondary" href={whatsappLink(b.business.whatsapp)} target="_blank" rel="noopener noreferrer">{t("m.contact")}</a>}
      <details className="card">
        <summary className="card-title" style={{ cursor: "pointer" }}>{t("m.data")}</summary>
        <a className="btn btn-secondary btn-small" href={`/m/${token}/export`}>{t("m.data.copy")}</a>
        <ClientActions token={token} deletionOnly />
      </details>
    </main>
  );
}
