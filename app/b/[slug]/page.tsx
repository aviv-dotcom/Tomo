import { notFound, redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shekels } from "@/lib/format";
import { fmtTime } from "@/lib/time";
import Link from "next/link";
import { OwnerNav } from "@/components/OwnerNav";
import { AddPerson } from "./AddPerson";
import { ActionCard } from "@/components/ActionCard";
import { loadInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";
const t = translator("he");

type Offering = { id: string; name: string; delivery: string; billing: string; minutes: number | null; priceAgorot: number; depositAgorot: number | null };
type Today = {
  business: { id: string; name: string; slug: string; timezone: string };
  today: string;
  counts: { active: number; leads: number; leads_week: number; offerings: number; collected_month: number };
  offerings: Offering[];
  recent: { id: string; name: string; status: string }[];
};

export default async function TodayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: biz } = await sb.from("businesses").select("id").eq("slug", slug).maybeSingle();
  if (!biz) notFound();
  const { data, error } = await sb.rpc("business_today", { p_business: biz.id });
  if (error || !data) notFound();
  const d = data as Today;
  const { data: agendaData } = await sb.rpc("day_agenda", { p_business: biz.id, p_date: d.today });
  const agenda = (agendaData ?? []) as { id: string; starts_at: string; offering: string; capacity: number; booked: number; people: string[] }[];
  const dateLabel = new Date(`${d.today}T12:00:00`).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const hasPeople = d.counts.active + d.counts.leads > 0;
  const { data: pageRow } = await sb.from("business_pages").select("published").eq("business_id", biz.id).maybeSingle();
  const published = !!pageRow?.published;
  const inbox = await loadInbox(sb, { id: biz.id, name: d.business.name, slug: d.business.slug, timezone: d.business.timezone });

  return (
    <>
      <main className="page">
        <div className="top">
          <div className="grow">
            <h1 className="h1">{d.business.name}</h1>
            <span className="muted">{t("today.hello")} · {dateLabel}</span>
          </div>
          <form action="/auth/signout" method="post"><button className="link-btn">{t("nav.signout")}</button></form>
        </div>

        <div className="kpis">
          <div className="kpi"><span className="muted small">{t("today.kpi.active")}</span><b>{d.counts.active}</b></div>
          <div className="kpi"><span className="muted small">{t("today.kpi.leads")}</span><b>{d.counts.leads_week}</b></div>
          <div className="kpi"><span className="muted small">{t("today.kpi.offerings")}</span><b>{d.counts.offerings}</b></div>
          <Link className="kpi link-row" href={`/b/${d.business.slug}/money`}><span className="muted small">{t("today.kpi.collected")}</span><b>{shekels(d.counts.collected_month)}</b></Link>
        </div>

        <section className="card">
          <h2 className="card-title">{t("today.waiting.title")}{inbox.length > 0 && <span className="tag">{inbox.length}</span>}</h2>
          {inbox.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("today.waiting.empty")}</p>}
          {inbox.slice(0, 3).map((i) => <ActionCard key={i.action.id} action={i.action} text={i.text} slug={d.business.slug} />)}
          <div className="row" style={{ justifyContent: "space-between" }}>
            {inbox.length > 3 ? <Link className="small" href={`/b/${d.business.slug}/inbox`}>{t("act.all")} ({inbox.length})</Link> : <span />}
            <Link className="small muted" href={`/b/${d.business.slug}/automations`}>{t("act.settings")}</Link>
          </div>
        </section>

        <section className="card" style={{ gap: 0 }}>
          <h2 className="card-title" style={{ marginBottom: 6 }}>{t("today.agenda.title")}<Link className="small" href={`/b/${d.business.slug}/calendar`}>{t("today.agenda.all")}</Link></h2>
          {agenda.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("today.agenda.empty")}</p>}
          {agenda.map((a) => (
            <Link key={a.id} href={`/b/${d.business.slug}/calendar/s/${a.id}`} className="list-row link-row">
              <span className="session-time">{fmtTime(a.starts_at, d.business.timezone)}</span>
              <span className="grow">{a.offering}{a.capacity === 1 && a.people[0] ? ` · ${a.people[0]}` : ""}</span>
              {a.capacity > 1 && <span className="muted small">{a.booked}/{a.capacity}</span>}
            </Link>
          ))}
        </section>

        <section className="card">
          <h2 className="card-title">{t("today.setup.title")}</h2>
          <div className="step"><span className={`dot ${d.counts.offerings ? "dot-done" : ""}`}>{d.counts.offerings ? "✓" : ""}</span>{t("today.setup.offerings")}</div>
          <div className="step"><span className={`dot ${hasPeople ? "dot-done" : ""}`}>{hasPeople ? "✓" : ""}</span>{t("today.setup.people")}</div>
          <Link className="step link-row" href={`/b/${d.business.slug}/site`}><span className={`dot ${published ? "dot-done" : ""}`}>{published ? "✓" : ""}</span><span className="grow">{t("today.setup.page")}</span>{!published && <span className="chev">‹</span>}</Link>
          <Link className="step link-row" href={`/b/${d.business.slug}/forms`}><span className="dot" /><span className="grow">{t("forms.title")}</span><span className="chev">‹</span></Link>
          <div className="step"><span className="dot" /><span className="grow">{t("today.setup.pay")}</span><span className="tag">{t("today.soon")}</span></div>
        </section>

        <section className="card">
          <h2 className="card-title">{t("today.people.title")}</h2>
          {d.recent.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("today.people.empty")}</p>}
          {d.recent.map((p) => (
            <div key={p.id} className="list-row">
              <span className="grow">{p.name}</span>
              <span className={`tag ${p.status === "active" ? "tag-good" : "tag-warn"}`}>{t(`status.${p.status}` as MessageKey)}</span>
            </div>
          ))}
          <AddPerson business={d.business.id} slug={d.business.slug} />
        </section>

        <section className="card">
          <h2 className="card-title">{t("today.offerings.title")}<Link className="small" href={`/b/${d.business.slug}/services`}>{t("svc.edit")}</Link></h2>
          {d.offerings.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("today.offerings.empty")}</p>}
          {d.offerings.map((o) => (
            <div key={o.id} className="list-row">
              <span className="grow">
                <span>{o.name}</span>
                <span className="muted small">
                  {[o.minutes ? `${o.minutes} ${t("minutes")}` : null,
                    o.depositAgorot ? `${t("deposit")} ${shekels(o.depositAgorot)}` : null,
                    o.delivery === "addon" ? t("delivery.addon") : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="price">{shekels(o.priceAgorot)} <span className="muted small">{t(`billing.${o.billing}` as MessageKey)}</span></span>
            </div>
          ))}
        </section>
      </main>
      <OwnerNav slug={d.business.slug} active="today" />
    </>
  );
}
