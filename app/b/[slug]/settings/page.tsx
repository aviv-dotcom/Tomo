import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { OwnerNav } from "@/components/OwnerNav";
import { BusinessForm, PolicyForm } from "./BusinessForm";
import { Icon, IconTile, Title, type IconName } from "@/components/Icon";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz, isOwner, role } = await requireBusiness(slug);
  const [{ data: b }, { data: page }, { data: form }, { count: hours }, { count: offerings }] = await Promise.all([
    sb.from("businesses").select("cancel_hours").eq("id", biz.id).single(),
    sb.from("business_pages").select("published").eq("business_id", biz.id).maybeSingle(),
    sb.from("business_forms").select("enabled").eq("business_id", biz.id).maybeSingle(),
    sb.from("business_hours").select("weekday", { count: "exact", head: true }).eq("business_id", biz.id),
    sb.from("offerings").select("id", { count: "exact", head: true }).eq("business_id", biz.id).eq("active", true),
  ]);
  const { data: { user } } = await sb.auth.getUser();
  const row = (icon: IconName, href: string, title: MessageKey, hint: MessageKey, tag?: React.ReactNode) => (
    <Link className="list-row link-row" href={`/b/${slug}/${href}`}>
      <IconTile n={icon} />
      <span className="grow"><span>{t(title)}</span><span className="muted small">{hint ? t(hint) : null}</span></span>
      {tag}<Icon n="chev" className="chev" />
    </Link>
  );
  const onOff = (on: boolean) => <span className={`tag ${on ? "tag-good" : ""}`}>{on ? t("set.on") : t("set.off")}</span>;
  return (
    <>
      <main className="page page-wide">
        <h1 className="h1">{t("set.title")}</h1>
<div className="cols">
        {isOwner ? <BusinessForm business={biz.id} name={biz.name} slug={biz.slug} /> : (
          <section className="card">
            <Title n="store">{t("set.business")}</Title>
            <span><b>{biz.name}</b></span>
            <span className="muted small input-ltr" style={{ textAlign: "start" }}>/p/{biz.slug}</span>
            <p className="small row" style={{ margin: 0, background: "var(--accent-soft)", padding: 10, borderRadius: 10, alignItems: "start" }}>
              <Icon n="shield" size={16} /><span>{t("set.manager_note").replace("{role}", t(`role.${role ?? "manager"}` as MessageKey))}</span></p>
          </section>
        )}
        {isOwner && <section className="card" style={{ gap: 0 }}>
          <Title n="calendar" style={{ marginBottom: 4 }}>{t("set.schedule")}</Title>
          {row("clock", "calendar/hours", "hours.title", "set.hours.hint", !hours ? <span className="tag tag-warn">!</span> : undefined)}
          {row("calendarOff", "calendar/off", "off.title", "set.off.hint")}
          {row("link", "calendar-sync", "sync.title", "sync.row.hint")}
        </section>}
        {isOwner && <PolicyForm business={biz.id} slug={slug} hours={b?.cancel_hours ?? 12} />}
        {isOwner && <section className="card" style={{ gap: 0 }}>
          <Title n="store" style={{ marginBottom: 4 }}>{t("set.offer")}</Title>
          {row("tag", "services", "svc.title", "set.services.hint", <span className="muted small">{offerings ?? 0}</span>)}
          {row("globe", "site", "site.title", "set.site.hint", onOff(!!page?.published))}
        </section>}
        <section className="card" style={{ gap: 0 }}>
          <Title n="chat" style={{ marginBottom: 4 }}>{isOwner ? t("set.clients") : t("set.useful")}</Title>
          {isOwner && row("zap", "automations", "auto.title", "set.auto.hint")}
          {isOwner && row("clipboard", "forms", "forms.title", "set.forms.hint", onOff(!!form?.enabled))}
          {row("users", "team", "team.title", isOwner ? "team.row.hint" : "team.row.view")}
          {!isOwner && row("trend", "reports", "rep.title", "set.reports.hint")}
          {!isOwner && page?.published && <a className="list-row link-row" href={`/p/${slug}`} target="_blank" rel="noopener noreferrer"><IconTile n="globe" /><span className="grow"><span>{t("site.open")}</span></span><Icon n="external" size={16} className="chev" /></a>}
          {isOwner && <div className="list-row"><IconTile n="card" tone="plain" /><span className="grow"><span>{t("set.pay")}</span></span><span className="tag">{t("today.soon")}</span></div>}
        </section>
        <section className="card">
          <Title n="user">{t("set.account")}</Title>
          <div className="row"><IconTile n="mail" tone="plain" /><span className="grow muted small input-ltr" style={{ textAlign: "start" }}>{user?.email}</span>
            <form action="/auth/signout" method="post"><button className="btn btn-secondary btn-small"><Icon n="logout" />{t("nav.signout")}</button></form></div>
        </section>
</div>
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
