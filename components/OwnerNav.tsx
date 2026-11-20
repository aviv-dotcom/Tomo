import Link from "next/link";
import { translator } from "@/lib/i18n";

const t = translator("he");
export type Section = "today" | "people" | "calendar" | "money" | "more";

const icons: Record<Section, React.ReactNode> = {
  today: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  money: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v5M18 9.5v5" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
};

/** Bottom navigation for the owner (a side rail on wide screens). */
export function OwnerNav({ slug, active }: { slug: string; active: Section }) {
  const items: [Section, string, string][] = [
    ["today", `/b/${slug}`, t("nav.today")],
    ["calendar", `/b/${slug}/calendar`, t("nav.calendar")],
    ["people", `/b/${slug}/people`, t("nav.people")],
    ["money", `/b/${slug}/money`, t("nav.money")],
    ["more", `/b/${slug}/settings`, t("nav.more")],
  ];
  return (
    <nav className="nav" aria-label="ניווט ראשי">
      {items.map(([s, href, label]) => (
        <Link key={s} className={active === s ? "on" : undefined} href={href} aria-current={active === s ? "page" : undefined}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[s]}</svg>
          {label}
        </Link>
      ))}
    </nav>
  );
}
