import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { OwnerNav } from "@/components/OwnerNav";
import { BusinessForm, PolicyForm } from "./BusinessForm";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { slug } = await params;
  const { saved } = await searchParams;
  const { sb, biz } = await requireBusiness(slug);
  const [{ data: b }, { data: page }, { data: form }, { count: hours }, { count: offerings }] = await Promise.all([
    sb.from("businesses").select("cancel_hours").eq("id", biz.id).single(),
    sb.from("business_pages").select("published").eq("business_id", biz.id).maybeSingle(),
    sb.from("business_forms").select("enabled").eq("business_id", biz.id).maybeSingle(),
    sb.from("business_hours").select("weekday", { count: "exact", head: true }).eq("business_id", biz.id),
    sb.from("offerings").select("id", { count: "exact", head: true }).eq("business_id", biz.id).eq("active", true),
  ]);
  const { data: { user } } = await sb.auth.getUser();
  const row = (href: string, title: MessageKey, hint: MessageKey, tag?: React.ReactNode) => (
    <Link className="list-row link-row" href={`/b/${slug}/${href}`}>
      <span className="grow"><span>{t(title)}</span><span className="muted small">{hint ? t(hint) : null}</span></span>
      {tag}<span className="chev">‹</span>
    </Link>
  );
  const onOff = (on: boolean) => <span className={`tag ${on ? "tag-good" : ""}`}>{on ? t("set.on") : t("set.off")}</span>;
  return (
    <>
      <main className="page">
        <h1 className="h1">{t("set.title")}</h1>
        <BusinessForm business={biz.id} name={biz.name} slug={biz.slug} saved={saved === "1"} />
        <section className="card" style={{ gap: 0 }}>
          <h2 className="card-title" style={{ marginBottom: 4 }}>{t("set.schedule")}</h2>
          {row("calendar/hours", "hours.title", "set.hours.hint", !hours ? <span className="tag tag-warn">!</span> : undefined)}
          {row("calendar/off", "off.title", "set.off.hint")}
        </section>
        <PolicyForm business={biz.id} slug={slug} hours={b?.cancel_hours ?? 12} />
        <section className="card" style={{ gap: 0 }}>
          <h2 className="card-title" style={{ marginBottom: 4 }}>{t("set.offer")}</h2>
          {row("services", "svc.title", "set.services.hint", <span className="muted small">{offerings ?? 0}</span>)}
          {row("site", "site.title", "set.site.hint", onOff(!!page?.published))}
        </section>
        <section className="card" style={{ gap: 0 }}>
          <h2 className="card-title" style={{ marginBottom: 4 }}>{t("set.clients")}</h2>
          {row("automations", "auto.title", "set.auto.hint")}
          {row("forms", "forms.title", "set.forms.hint", onOff(!!form?.enabled))}
          <div className="list-row"><span className="grow"><span>{t("set.pay")}</span></span><span className="tag">{t("today.soon")}</span></div>
        </section>
        <section className="card">
          <h2 className="card-title">{t("set.account")}</h2>
          <div className="row"><span className="grow muted small input-ltr" style={{ textAlign: "start" }}>{user?.email}</span>
            <form action="/auth/signout" method="post"><button className="btn btn-secondary btn-small">{t("nav.signout")}</button></form></div>
        </section>
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
