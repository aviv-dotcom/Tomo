import Link from "next/link";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate } from "@/lib/time";
import { Avatar, Icon, Title } from "@/components/Icon";
import { removeFromWaitlist } from "@/app/b/[slug]/waitlist/actions";

const t = translator("he");
export type WaitEntry = { id: string; date: string; part: string; offering: { id: string; name: string }; person: { id: string; name: string; phone: string | null } };

/** People waiting for an appointment, with a quick way to book them or take them off the list. */
export function WaitlistCard({ slug, timezone, entries, date }: { slug: string; timezone: string; entries: WaitEntry[]; date?: string }) {
  const list = date ? entries.filter((e) => e.date === date) : entries;
  if (list.length === 0) return null;
  return (
    <section className="card" style={{ gap: 0 }}>
      <Title n="clock" style={{ marginBottom: 4 }} extra={<span className="tag">{list.length}</span>}>{t("waitlist.title")}</Title>
      {list.map((e) => (
        <div key={e.id} className="list-row" style={{ flexWrap: "wrap" }}>
          <Avatar name={e.person.name} size={34} />
          <Link href={`/b/${slug}/people/${e.person.id}`} className="grow" style={{ color: "inherit", textDecoration: "none" }}>
            <span>{e.person.name}</span>
            <span className="muted small">{e.offering.name} · {fmtDate(`${e.date}T12:00:00Z`, timezone)} · {t(`part.${e.part}` as MessageKey)}</span>
          </Link>
          <Link className="btn btn-primary btn-small" href={`/b/${slug}/calendar/new?person=${e.person.id}&d=${e.date}&o=${e.offering.id}`}><Icon n="calendarPlus" />{t("waitlist.book")}</Link>
          <form action={removeFromWaitlist}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="slug" value={slug} />
            <button className="btn btn-secondary btn-small" aria-label={t("waitlist.remove")} title={t("waitlist.remove")}><Icon n="x" /></button></form>
        </div>
      ))}
    </section>
  );
}
