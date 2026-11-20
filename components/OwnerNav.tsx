import Link from "next/link";
import { translator } from "@/lib/i18n";

const t = translator("he");

/** Bottom navigation for the owner. Sections not built yet are shown dimmed so the shape of the app is clear. */
export function OwnerNav({ slug }: { slug: string }) {
  const soon = (label: string) => <span className="off" title={t("today.soon")}>{label}</span>;
  return (
    <nav className="nav" aria-label="ניווט ראשי">
      <Link className="on" href={`/b/${slug}`} aria-current="page">{t("nav.today")}</Link>
      {soon(t("nav.people"))}
      {soon(t("nav.calendar"))}
      {soon(t("nav.money"))}
      {soon(t("nav.sales"))}
    </nav>
  );
}
