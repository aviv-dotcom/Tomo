import Link from "next/link";
import { translator } from "@/lib/i18n";

const t = translator("he");
type Section = "today" | "people" | "calendar" | "money";

/** Bottom navigation for the owner. Sections not built yet are shown dimmed so the shape of the app is clear. */
export function OwnerNav({ slug, active }: { slug: string; active: Section }) {
  const link = (s: Section, href: string, label: string) => (
    <Link className={active === s ? "on" : undefined} href={href} aria-current={active === s ? "page" : undefined}>{label}</Link>
  );
  return (
    <nav className="nav" aria-label="ניווט ראשי">
      {link("today", `/b/${slug}`, t("nav.today"))}
      {link("people", `/b/${slug}/people`, t("nav.people"))}
      {link("calendar", `/b/${slug}/calendar`, t("nav.calendar"))}
      {link("money", `/b/${slug}/money`, t("nav.money"))}
      <span className="off" title={t("today.soon")}>{t("nav.sales")}</span>
    </nav>
  );
}
