import Link from "next/link";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shekels, whatsappLink } from "@/lib/format";
import { fmtDate, fmtTime, minToTime } from "@/lib/time";
import { mediaUrl, PAGE_SECTIONS } from "@/lib/media";
import { FONT_VARS, pageStyle } from "@/lib/fonts";
import { Icon, IconTile, Title } from "@/components/Icon";

const t = translator("he");

export type Addon = { id: string; name: string; delivery: string; minutes: number | null; priceAgorot: number };

export type PageData = {
  name: string; slug: string; timezone: string; vocabulary?: Record<string, string>;
  tagline: string | null; about: string | null; whatsapp: string | null; address: string | null;
  accent: string | null; font_heading?: string | null; font_body?: string | null; text_size?: string | null; logo: string | null; cover: string | null; gallery: string[];
  instagram: string | null; facebook: string | null; tiktok: string | null; website: string | null; sections: string[] | null;
  hours: { weekday: number; start: number; end: number }[];
  offerings: { id: string; name: string; delivery: string; billing: string; minutes: number | null; priceAgorot: number }[];
  addons?: Addon[];
  providers?: { id: string; name: string; color: string; offerings: string[] | null; bio?: string | null; photo?: string | null }[];
  classes: { id: string; offering_id: string; offering: string; starts_at: string; location: string | null; left: number }[];
};

/**
 * The business page as clients see it. Used by the public page and, with `preview`, live inside the editor
 * (links do nothing there). Pure: no data loading, no hooks.
 */
export function PublicPageView({ p: raw, preview = false }: { p: PageData; preview?: boolean }) {
  // Older data may lack the design fields; treat them as empty.
  const p: PageData = { ...raw, gallery: raw.gallery ?? [], hours: raw.hours ?? [] };
  const classIds = new Set(p.classes.map((c) => c.offering_id));
  const sections = (p.sections ?? [...PAGE_SECTIONS]).filter((s): s is (typeof PAGE_SECTIONS)[number] => (PAGE_SECTIONS as readonly string[]).includes(s));
  const logo = mediaUrl(p.logo), cover = mediaUrl(p.cover);
  const style = pageStyle(p);
  const bookable = p.offerings.some((o) => o.delivery === "appointment");
  const socials = [
    p.instagram && { n: "instagram" as const, href: `https://instagram.com/${p.instagram}`, label: "Instagram" },
    p.facebook && { n: "facebook" as const, href: `https://facebook.com/${p.facebook}`, label: "Facebook" },
    p.tiktok && { n: "tiktok" as const, href: `https://www.tiktok.com/@${p.tiktok}`, label: "TikTok" },
    p.website && { n: "globe" as const, href: p.website, label: t("pub.website") },
  ].filter(Boolean) as { n: "instagram" | "facebook" | "tiktok" | "globe"; href: string; label: string }[];
  const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

  const block: Record<(typeof PAGE_SECTIONS)[number], React.ReactNode> = {
    services: p.offerings.length > 0 && (
      <section key="services" className="card" style={{ gap: 0 }} id="services">
        <Title n="tag" style={{ marginBottom: 6 }}>{t("pub.services")}</Title>
        {p.offerings.map((o) => (
          <div key={o.id} className="list-row">
            <IconTile n={o.delivery === "class" ? "users" : o.delivery === "appointment" ? "user" : "tag"} size={34} />
            <span className="grow"><span>{o.name}</span>
              <span className="muted small">{shekels(o.priceAgorot)} {t(`billing.${o.billing}` as MessageKey)}{o.minutes ? ` · ${o.minutes} ${t("minutes")}` : ""}</span></span>
            {o.delivery === "appointment" && <Link className="btn btn-primary btn-small" href={`/p/${p.slug}/book?o=${o.id}`}><Icon n="calendarPlus" />{t("pub.book")}</Link>}
            {o.delivery === "class" && classIds.has(o.id) && <a className="btn btn-secondary btn-small" href="#classes">{t("pub.join")}</a>}
            {o.delivery === "product" && <Link className="btn btn-secondary btn-small" href={`/p/${p.slug}/order?o=${o.id}`}><Icon n="plus" />{t("order.cta")}</Link>}
          </div>
        ))}
      </section>
    ),
    classes: p.classes.length > 0 && (
      <section key="classes" className="card" style={{ gap: 0 }} id="classes">
        <Title n="calendar" style={{ marginBottom: 6 }}>{t("pub.classes")}</Title>
        {p.classes.map((c) => (
          <div key={c.id} className="list-row">
            <span className="grow"><span>{c.offering}</span>
              <span className="muted small">{fmtDate(c.starts_at, p.timezone)} · {fmtTime(c.starts_at, p.timezone)}{c.location ? ` · ${c.location}` : ""}</span>
              {c.left > 0 && c.left <= 3 && <span className="small" style={{ color: "var(--bad)" }}>{t("pub.few_left").replace("{n}", String(c.left))}</span>}</span>
            {c.left > 0
              ? <Link className="btn btn-primary btn-small" href={`/p/${p.slug}/book?s=${c.id}`}>{t("pub.join")}</Link>
              : <Link className="btn btn-secondary btn-small" href={`/p/${p.slug}/book?s=${c.id}&w=1`}><Icon n="clock" />{t("pub.waitlist")}</Link>}
          </div>
        ))}
      </section>
    ),
    team: (p.providers ?? []).some((x) => x.photo || x.bio) && (
      <section key="team" className="card" style={{ gap: 0 }}>
        <Title n="users" style={{ marginBottom: 6 }}>{t("pub.team")}</Title>
        {(p.providers ?? []).map((x) => (
          <div key={x.id} className="list-row">
            {x.photo ? <img src={mediaUrl(x.photo) ?? ""} alt="" className="prov-photo" style={{ width: 52, height: 52 }} loading="lazy" />
              : <span className="avatar" style={{ width: 52, height: 52, background: x.color, color: "#fff", fontSize: 20 }}>{x.name.slice(0, 1)}</span>}
            <span className="grow"><b>{x.name}</b>{x.bio && <span className="muted small">{x.bio}</span>}</span>
          </div>
        ))}
      </section>
    ),
    gallery: p.gallery.length > 0 && (
      <section key="gallery" className="card">
        <Title n="image">{t("pub.gallery")}</Title>
        <div className="gallery">
          {p.gallery.map((g) => <a key={g} href={mediaUrl(g) ?? "#"} {...ext}><img src={mediaUrl(g) ?? ""} alt="" loading="lazy" /></a>)}
        </div>
      </section>
    ),
    about: p.about && (
      <section key="about" className="card"><Title n="info">{t("pub.about")}</Title><p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-line" }}>{p.about}</p></section>
    ),
    hours: p.hours.length > 0 && (
      <section key="hours" className="card" style={{ gap: 0 }}>
        <Title n="clock" style={{ marginBottom: 4 }}>{t("pub.hours")}</Title>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const ranges = p.hours.filter((h) => h.weekday === d);
          return (
            <div key={d} className="list-row" style={{ minHeight: 40, padding: "6px 0" }}>
              <span className="grow">{t(`day.${d}` as MessageKey)}</span>
              {ranges.length ? <bdi dir="ltr" className="small" style={{ fontVariantNumeric: "tabular-nums" }}>{ranges.map((r) => `${minToTime(r.start)}–${minToTime(r.end)}`).join(", ")}</bdi>
                : <span className="muted small">{t("hours.closed")}</span>}
            </div>
          );
        })}
      </section>
    ),
    contact: (p.whatsapp || p.address || socials.length > 0) && (
      <section key="contact" className="card">
        <Title n="chat">{t("pub.contact")}</Title>
        {p.whatsapp && <a className="btn btn-primary" href={whatsappLink(p.whatsapp)} {...ext}><Icon n="chat" />{t("pub.whatsapp")}</a>}
        {p.address && (
          <div className="row btn-row">
            <a className="btn btn-secondary btn-small" href={`https://waze.com/ul?q=${encodeURIComponent(p.address)}&navigate=yes`} {...ext}><Icon n="navigate" />Waze</a>
            <a className="btn btn-secondary btn-small" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`} {...ext}><Icon n="pin" />{t("pub.maps")}</a>
          </div>
        )}
        {socials.length > 0 && (
          <div className="socials">
            {socials.map((s) => <a key={s.n} href={s.href} {...ext} aria-label={s.label} title={s.label}><Icon n={s.n} size={22} /></a>)}
          </div>
        )}
      </section>
    ),
  };

  return (
    <div className={`pub pub-font ${FONT_VARS} ${preview ? "pub-preview" : ""}`} style={style} inert={preview || undefined}>
      <header className={`pub-hero ${cover ? "has-cover" : ""}`}>
        {cover && <img className="pub-cover" src={cover} alt="" />}
        {logo ? <img className="pub-logo" src={logo} alt="" /> : <span className="hero-mark pub-logo" aria-hidden="true">{p.name.slice(0, 1)}</span>}
        <h1 className="h1">{p.name}</h1>
        {p.tagline && <p className="sub" style={{ fontSize: 17 }}>{p.tagline}</p>}
        {p.address && <span className="meta"><Icon n="pin" size={15} />{p.address}</span>}
        {(bookable || p.whatsapp) && (
          <div className="row btn-row" style={{ width: "100%", marginTop: 6 }}>
            {bookable && <a className="btn btn-primary" href="#services"><Icon n="calendarPlus" />{t("pub.book_now")}</a>}
            {p.whatsapp && <a className="btn btn-secondary" href={whatsappLink(p.whatsapp)} {...ext}><Icon n="chat" />{t("card.whatsapp")}</a>}
          </div>
        )}
      </header>
      {sections.map((s) => block[s])}
      <p className="muted small legal-links">
        <Link href={`/p/${p.slug}/accessibility`}>{t("legal.accessibility")}</Link> · <Link href={`/p/${p.slug}/privacy`}>{t("legal.privacy")}</Link> · {t("pub.powered")}
      </p>
    </div>
  );
}
