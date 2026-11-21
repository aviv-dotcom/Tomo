import type { Metadata } from "next";
import Link from "next/link";
import { anonSupabase } from "@/lib/supabase/anon";
import { translator } from "@/lib/i18n";
import { whatsappLink } from "@/lib/format";
import { fmtDate, fmtTime } from "@/lib/time";
import { Icon, IconTile } from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
const t = translator("he");
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

type Visit = { business: { name: string; slug: string; timezone: string; whatsapp: string | null; page: boolean }; first_name: string;
  offering: string; starts_at: string; provider: string | null; note: string | null; photos: { id: string; kind: string }[] };

/** The visit summary the business chose to share with the client: private link, no sign-in. */
export default async function VisitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = isUuid(token) ? await anonSupabase().rpc("public_visit", { p_token: token }) : { data: null };
  const v = data as Visit | null;
  if (!v) return <main className="page" style={{ paddingTop: 56 }}><IconTile n="search" size={56} tone="plain" /><h1 className="h1">{t("v.notfound")}</h1><p className="muted">{t("v.notfound.sub")}</p></main>;
  const tz = v.business.timezone;
  const before = v.photos.filter((p) => p.kind === "before"), after = v.photos.filter((p) => p.kind !== "before");
  const img = (p: { id: string; kind: string }) => <a key={p.id} className="photo" href={`/v/${token}/photo/${p.id}`} target="_blank" rel="noopener noreferrer"><img src={`/v/${token}/photo/${p.id}`} alt={t(p.kind === "before" ? "photo.before" : "photo.after")} /></a>;
  return (
    <main className="page" style={{ paddingBottom: 40 }}>
      <span className="muted small">{v.business.name}</span>
      <h1 className="h1">{t("v.title").replace("{name}", v.first_name)}</h1>
      <div className="row" style={{ flexWrap: "wrap", gap: 14 }}>
        <span className="meta"><Icon n="sparkles" size={16} />{v.offering}</span>
        <span className="meta"><Icon n="calendar" size={16} />{fmtDate(v.starts_at, tz)} · {fmtTime(v.starts_at, tz)}</span>
        {v.provider && <span className="meta"><Icon n="user" size={16} />{v.provider}</span>}
      </div>
      {v.note && <section className="card"><p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-line" }}>{v.note}</p></section>}
      {v.photos.length > 0 && (
        <section className="card">
          <div className="ba">
            {before.length > 0 && <div className="ba-col"><span className="ba-label">{t("photo.before")}</span>{before.map(img)}</div>}
            {after.length > 0 && <div className="ba-col"><span className="ba-label">{t("photo.after")}</span>{after.map(img)}</div>}
          </div>
        </section>
      )}
      <div className="row btn-row">
        {v.business.page && <Link className="btn btn-primary" href={`/p/${v.business.slug}/book`}><Icon n="calendarPlus" />{t("v.again")}</Link>}
        {v.business.whatsapp && <a className="btn btn-secondary" href={whatsappLink(v.business.whatsapp)} target="_blank" rel="noopener noreferrer"><Icon n="chat" />{t("card.whatsapp")}</a>}
      </div>
      <p className="muted small row" style={{ gap: 6 }}><Icon n="shield" size={14} />{t("v.private")}</p>
    </main>
  );
}
