import { headers } from "next/headers";
import { requireBusiness } from "@/lib/biz";
import { siteBase } from "@/lib/site";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { Back, Icon, IconTile, Title } from "@/components/Icon";
import { CopyLink } from "./CopyLink";
import { rotateCalendarLink } from "./actions";

export const dynamic = "force-dynamic";
const t = translator("he");

/** Connects the owner's own calendar app to Tomo with a private subscription link. */
export default async function CalendarSyncPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data: token, error } = await sb.rpc("calendar_link", { p_business: biz.id });
  const h = await headers();
  const base = siteBase() || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const https = `${base}/cal/${token}.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  const apps = [
    { n: "calendar" as const, name: "Google Calendar", hint: t("sync.google.hint"), href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` },
    { n: "calendarPlus" as const, name: t("sync.apple"), hint: t("sync.apple.hint"), href: webcal },
    { n: "mail" as const, name: "Outlook", hint: t("sync.outlook.hint"), href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(biz.name)}` },
  ];
  return (
    <>
      <main className="page">
        <Back href={`/b/${slug}/settings`} label={t("set.title")} />
        <h1 className="h1">{t("sync.title")}</h1>
        <p className="sub">{t("sync.subtitle")}</p>
        {error ? <p className="error">{t("err.not_owner")}</p> : (
          <>
            <section className="card" style={{ gap: 0 }}>
              <Title n="link" style={{ marginBottom: 4 }}>{t("sync.connect")}</Title>
              {apps.map((a) => (
                <a key={a.name} className="list-row link-row" href={a.href} target="_blank" rel="noopener noreferrer">
                  <IconTile n={a.n} />
                  <span className="grow"><span>{a.name}</span><span className="muted small">{a.hint}</span></span>
                  <Icon n="external" size={16} className="chev" />
                </a>
              ))}
            </section>
            <section className="card">
              <Title n="copy">{t("sync.other")}</Title>
              <p className="muted small" style={{ margin: 0 }}>{t("sync.other.hint")}</p>
              <span className="input-ltr small" style={{ textAlign: "start", wordBreak: "break-all", background: "var(--bg)", padding: 10, borderRadius: 10 }}>{https}</span>
              <CopyLink url={https} />
            </section>
            <section className="card">
              <Title n="info">{t("sync.what")}</Title>
              <ul className="small" style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.8 }}>
                <li>{t("sync.what.1")}</li><li>{t("sync.what.2")}</li><li>{t("sync.what.3")}</li><li>{t("sync.what.4")}</li>
              </ul>
            </section>
            <section className="card">
              <Title n="shield">{t("sync.private")}</Title>
              <p className="muted small" style={{ margin: 0 }}>{t("sync.private.hint")}</p>
              <form action={rotateCalendarLink}>
                <input type="hidden" name="business" value={biz.id} /><input type="hidden" name="slug" value={slug} />
                <button className="btn btn-secondary btn-small"><Icon n="repeat" />{t("sync.rotate")}</button>
              </form>
            </section>
          </>
        )}
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
