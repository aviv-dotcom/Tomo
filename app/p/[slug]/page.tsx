import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicPage, whatsappLink } from "@/lib/public";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shekels } from "@/lib/format";
import { fmtDate, fmtTime } from "@/lib/time";

export const dynamic = "force-dynamic";
const t = translator("he");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPublicPage((await params).slug);
  if (!p) return { title: "Tomo" };
  return { title: p.name, description: p.tagline ?? undefined, robots: { index: true, follow: true } };
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicPage(slug);
  if (!p) notFound();
  const classIds = new Set(p.classes.map((c) => c.offering_id));
  return (
    <main className="page" style={{ paddingBottom: 40 }}>
      <header className="hero">
        <span className="hero-mark" aria-hidden="true">{p.name.slice(0, 1)}</span>
        <h1 className="h1">{p.name}</h1>
        {p.tagline && <p className="sub" style={{ fontSize: 17 }}>{p.tagline}</p>}
        {p.address && <span className="muted small">📍 {p.address}</span>}
      </header>

      <section className="card" style={{ gap: 0 }}>
        <h2 className="card-title" style={{ marginBottom: 6 }}>{t("pub.services")}</h2>
        {p.offerings.map((o) => (
          <div key={o.id} className="list-row">
            <span className="grow"><span>{o.name}</span>
              <span className="muted small">{shekels(o.priceAgorot)} {t(`billing.${o.billing}` as MessageKey)}{o.minutes ? ` · ${o.minutes} ${t("minutes")}` : ""}</span></span>
            {o.delivery === "appointment" && <Link className="btn btn-primary btn-small" href={`/p/${slug}/book?o=${o.id}`}>{t("pub.book")}</Link>}
            {o.delivery === "class" && classIds.has(o.id) && <a className="btn btn-secondary btn-small" href="#classes">{t("pub.join")}</a>}
          </div>
        ))}
      </section>

      {p.classes.length > 0 && (
        <section className="card" style={{ gap: 0 }} id="classes">
          <h2 className="card-title" style={{ marginBottom: 6 }}>{t("pub.classes")}</h2>
          {p.classes.map((c) => (
            <div key={c.id} className="list-row">
              <span className="grow"><span>{c.offering}</span>
                <span className="muted small">{fmtDate(c.starts_at, p.timezone)} · {fmtTime(c.starts_at, p.timezone)}{c.location ? ` · ${c.location}` : ""}</span></span>
              {c.left > 0
                ? <Link className="btn btn-primary btn-small" href={`/p/${slug}/book?s=${c.id}`}>{t("pub.join")}</Link>
                : <span className="tag tag-warn">{t("pub.full")}</span>}
            </div>
          ))}
        </section>
      )}

      {p.about && <section className="card"><h2 className="card-title">{t("pub.about")}</h2><p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-line" }}>{p.about}</p></section>}
      {p.whatsapp && <a className="btn btn-secondary" href={whatsappLink(p.whatsapp)} target="_blank" rel="noopener noreferrer">{t("pub.whatsapp")}</a>}
      <p className="muted small" style={{ textAlign: "center" }}>{t("pub.powered")}</p>
    </main>
  );
}
