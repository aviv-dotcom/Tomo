import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate, fmtTime } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { PersonForm } from "./PersonForm";

export const dynamic = "force-dynamic";
const t = translator("he");

type Card = { id: string; name: string; phone: string | null; email: string | null; status: string; marketing_consent: boolean;
  visits: number; no_shows: number; bookings: { id: string; session_id: string; starts_at: string; offering: string; status: string }[] };

export default async function PersonPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data, error } = await sb.rpc("person_card", { p_person: id });
  if (error || !data) notFound();
  const p = data as Card;
  return (
    <>
      <main className="page">
        <Link href={`/b/${slug}/people`} className="muted small">→ {t("back")}</Link>
        <div className="top"><h1 className="h1">{p.name}</h1>
          <Link className="btn btn-primary btn-small" href={`/b/${slug}/calendar/new?person=${p.id}`}>{t("card.book")}</Link></div>
        <div className="kpis">
          <div className="kpi"><span className="muted small">{t("card.visits")}</span><b>{p.visits}</b></div>
          <div className="kpi"><span className="muted small">{t("card.noshows")}</span><b>{p.no_shows}</b></div>
        </div>
        <section className="card" style={{ gap: 0 }}>
          <h2 className="card-title" style={{ marginBottom: 6 }}>{t("card.history")}</h2>
          {p.bookings.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("card.history.empty")}</p>}
          {p.bookings.map((b) => (
            <Link key={b.id} href={`/b/${slug}/calendar/s/${b.session_id}`} className="list-row link-row">
              <span className="grow"><span>{b.offering}</span><span className="muted small">{fmtDate(b.starts_at, biz.timezone)} · {fmtTime(b.starts_at, biz.timezone)}</span></span>
              <span className="tag">{t(`bstatus.${b.status}` as MessageKey)}</span>
            </Link>
          ))}
        </section>
        <PersonForm p={p} slug={slug} />
      </main>
      <OwnerNav slug={slug} active="people" />
    </>
  );
}
