import { notFound, redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shekels } from "@/lib/format";
import { fmtTime } from "@/lib/time";
import Link from "next/link";
import { OwnerNav } from "@/components/OwnerNav";
import { ActionCard } from "@/components/ActionCard";
import { loadInbox } from "@/lib/inbox";
import { Avatar, Empty, Icon, IconTile, Title, type IconName } from "@/components/Icon";

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
  const [{ data: pageRow }, { data: formRow }, { count: hoursCount }] = await Promise.all([
    sb.from("business_pages").select("published").eq("business_id", biz.id).maybeSingle(),
    sb.from("business_forms").select("enabled").eq("business_id", biz.id).maybeSingle(),
    sb.from("business_hours").select("weekday", { count: "exact", head: true }).eq("business_id", biz.id),
  ]);
  const published = !!pageRow?.published;
  const steps: { done: boolean; label: MessageKey; href: string; icon: IconName; optional?: boolean }[] = [
    { done: d.counts.offerings > 0, label: "today.setup.offerings", href: "services", icon: "tag" },
    { done: (hoursCount ?? 0) > 0, label: "today.setup.hours", href: "calendar/hours", icon: "clock" },
    { done: hasPeople, label: "today.setup.people", href: "people?add=1", icon: "userPlus" },
    { done: published, label: "today.setup.page", href: "site", icon: "globe" },
    { done: !!formRow?.enabled, label: "today.setup.forms", href: "forms", icon: "clipboard", optional: true },
  ];
  const setupDone = steps.every((x) => x.done || x.optional);
  const inbox = await loadInbox(sb, { id: biz.id, name: d.business.name, slug: d.business.slug, timezone: d.business.timezone });

  return (
    <>
      <main className="page">
        <div className="top">
          <div className="grow">
            <h1 className="h1">{d.business.name}</h1>
            <span className="muted">{t("today.hello")} · {dateLabel}</span>
          </div>
        </div>

        <div className="row">
          <Link className="btn btn-primary btn-small" style={{ flex: 1 }} href={`/b/${d.business.slug}/calendar/new`}><Icon n="calendarPlus" />{t("today.quick.appt")}</Link>
          <Link className="btn btn-secondary btn-small" style={{ flex: 1 }} href={`/b/${d.business.slug}/people?add=1`}><Icon n="userPlus" />{t("today.quick.person")}</Link>
        </div>

        <div className="kpis">
          <Link className="kpi link-row" href={`/b/${d.business.slug}/people?s=active`}><span className="kpi-label"><Icon n="users" size={15} />{t("today.kpi.active")}</span><b>{d.counts.active}</b></Link>
          <Link className="kpi link-row" href={`/b/${d.business.slug}/people?s=lead`}><span className="kpi-label"><Icon n="sparkles" size={15} />{t("today.kpi.leads")}</span><b>{d.counts.leads_week}</b></Link>
          <Link className="kpi link-row" href={`/b/${d.business.slug}/calendar`}><span className="kpi-label"><Icon n="calendar" size={15} />{t("today.kpi.sessions")}</span><b>{agenda.length}</b></Link>
          <Link className="kpi link-row" href={`/b/${d.business.slug}/money`}><span className="kpi-label"><Icon n="money" size={15} />{t("today.kpi.collected")}</span><b>{shekels(d.counts.collected_month)}</b></Link>
        </div>

        <section className="card">
          <Title n="inbox" extra={inbox.length > 0 ? <span className="tag">{inbox.length}</span> : undefined}>{t("today.waiting.title")}</Title>
          {inbox.length === 0 && <Empty n="check" text={t("today.waiting.empty")} />}
          {inbox.slice(0, 3).map((i) => <ActionCard key={i.action.id} action={i.action} text={i.text} slug={d.business.slug} />)}
          <div className="row" style={{ justifyContent: "space-between" }}>
            {inbox.length > 3 ? <Link className="small" href={`/b/${d.business.slug}/inbox`}>{t("act.all")} ({inbox.length})</Link> : <span />}
            <Link className="small muted meta" href={`/b/${d.business.slug}/automations`}><Icon n="zap" size={14} />{t("act.settings")}</Link>
          </div>
        </section>

        <section className="card" style={{ gap: 0 }}>
          <Title n="calendar" style={{ marginBottom: 6 }} extra={<Link className="small" href={`/b/${d.business.slug}/calendar`}>{t("today.agenda.all")}</Link>}>{t("today.agenda.title")}</Title>
          {agenda.length === 0 && <Empty n="sun" text={t("today.agenda.empty")} />}
          {agenda.map((a) => (
            <Link key={a.id} href={`/b/${d.business.slug}/calendar/s/${a.id}`} className="list-row link-row">
              <span className="session-time">{fmtTime(a.starts_at, d.business.timezone)}</span>
              <IconTile n={a.capacity > 1 ? "users" : "user"} size={30} />
              <span className="grow">{a.offering}{a.capacity === 1 && a.people[0] ? ` · ${a.people[0]}` : ""}</span>
              {a.capacity > 1 && <span className="muted small">{a.booked}/{a.capacity}</span>}
              <Icon n="chev" className="chev" />
            </Link>
          ))}
        </section>

        {!setupDone && (
          <section className="card" style={{ gap: 0 }}>
            <Title n="sparkles" style={{ marginBottom: 4 }} extra={<span className="muted small">{steps.filter((x) => x.done).length}/{steps.length}</span>}>{t("today.setup.title")}</Title>
            {steps.map((x) => (
              <Link key={x.label} className="list-row link-row" href={`/b/${d.business.slug}/${x.href}`}>
                <IconTile n={x.done ? "check" : x.icon} tone={x.done ? "good" : "accent"} size={32} />
                <span className="grow" style={x.done ? { color: "var(--ink-2)", textDecoration: "line-through" } : undefined}>{t(x.label)}</span>
                {!x.done && <Icon n="chev" className="chev" />}
              </Link>
            ))}
          </section>
        )}

        <section className="card" style={{ gap: 0 }}>
          <Title n="users" style={{ marginBottom: 4 }} extra={<Link className="small" href={`/b/${d.business.slug}/people`}>{t("today.people.all")}</Link>}>{t("today.people.title")}</Title>
          {d.recent.length === 0 && <Empty n="userPlus" text={t("today.people.empty")} />}
          {d.recent.map((p) => (
            <Link key={p.id} href={`/b/${d.business.slug}/people/${p.id}`} className="list-row link-row">
              <Avatar name={p.name} size={34} />
              <span className="grow">{p.name}</span>
              <span className={`tag ${p.status === "active" ? "tag-good" : "tag-warn"}`}>{t(`status.${p.status}` as MessageKey)}</span>
            </Link>
          ))}
        </section>
      </main>
      <OwnerNav slug={d.business.slug} active="today" />
    </>
  );
}
