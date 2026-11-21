import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shekels } from "@/lib/format";
import { fmtDate, fmtTime } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { AddPerson } from "../AddPerson";
import { Avatar, Empty, Icon, Title } from "@/components/Icon";

export const dynamic = "force-dynamic";
const t = translator("he");
const STATUSES = ["active", "lead", "paused", "left"] as const;
const SORTS = ["name", "recent", "debt"] as const;

type Person = { id: string; name: string; phone: string | null; status: string; alert: boolean; created_at: string; visits: number;
  last_visit: string | null; next: { at: string; offering: string } | null; balance: number };

export default async function PeoplePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; s?: string; o?: string; add?: string }> }) {
  const { slug } = await params;
  const { q = "", s, o, add } = await searchParams;
  const status = STATUSES.find((x) => x === s) ?? null;
  const sort = SORTS.find((x) => x === o) ?? "name";
  const { sb, biz } = await requireBusiness(slug);
  const tz = biz.timezone;
  const [{ data }, { data: countData }] = await Promise.all([
    sb.rpc("list_people", { p_business: biz.id, p_search: q || null, p_status: status }),
    sb.rpc("people_counts", { p_business: biz.id }),
  ]);
  const counts = (countData ?? {}) as Record<string, number>;
  const people = ((data ?? []) as Person[]).slice();
  const recent = (p: Person) => Math.max(p.last_visit ? Date.parse(p.last_visit) : 0, p.next ? Date.parse(p.next.at) : 0, Date.parse(p.created_at));
  if (sort === "recent") people.sort((a, b) => recent(b) - recent(a));
  if (sort === "debt") people.sort((a, b) => b.balance - a.balance);
  const href = (st: string | null, so: string = sort) =>
    `/b/${slug}/people?${new URLSearchParams({ ...(q ? { q } : {}), ...(st ? { s: st } : {}), ...(so !== "name" ? { o: so } : {}) })}`;
  const owed = people.filter((p) => p.balance > 0).length;
  const day = (iso: string) => fmtDate(iso, tz);
  return (
    <>
      <main className="page page-wide">
        <details className="adder" open={add === "1"}>
          <summary className="top"><span className="grow"><h1 className="h1">{t("people.title")}</h1>
            <span className="muted small">{t("people.count").replace("{n}", String(counts.all ?? people.length))}{owed > 0 ? ` · ${t("people.owed").replace("{n}", String(owed))}` : ""}</span></span>
            <span className="btn btn-primary btn-small"><Icon n="userPlus" />{t("people.add.title")}</span></summary>
          <section className="card" style={{ marginTop: 12 }}><Title n="userPlus">{t("people.add.title")}</Title><AddPerson business={biz.id} slug={slug} /></section>
        </details>
        <form className="row search" action={`/b/${slug}/people`}>
          <Icon n="search" className="search-icon" />
          {status && <input type="hidden" name="s" value={status} />}
          {sort !== "name" && <input type="hidden" name="o" value={sort} />}
          <input className="input" style={{ flex: 1 }} name="q" defaultValue={q} placeholder={t("people.search")} aria-label={t("people.search")} />
        </form>
        <div className="people-bar">
          <div className="chips">
            <Link className={`chip ${!status ? "chip-on" : ""}`} href={href(null)}>{t("people.all")}<span className="chip-n">{counts.all ?? 0}</span></Link>
            {STATUSES.map((st) => <Link key={st} className={`chip ${status === st ? "chip-on" : ""}`} href={href(st)}>{t(`status.${st}` as MessageKey)}<span className="chip-n">{counts[st] ?? 0}</span></Link>)}
          </div>
          <div className="sort" role="group" aria-label={t("people.sort")}>
            <span className="muted small">{t("people.sort")}:</span>
            {SORTS.map((so) => <Link key={so} className={`sort-opt ${sort === so ? "on" : ""}`} href={href(status, so)} aria-current={sort === so ? "true" : undefined}>{t(`people.sort.${so}` as MessageKey)}</Link>)}
          </div>
        </div>
        <section className="card people-list" style={{ gap: 0, padding: 0 }}>
          {people.length === 0 ? <div style={{ padding: 16 }}><Empty n="users" text={q ? t("people.nomatch") : t("people.empty")} /></div> : (
            <div className="person-row person-head" aria-hidden="true">
              <span /><span>{t("people.col.client")}</span><span>{t("people.col.last")}</span><span>{t("people.col.next")}</span>
              <span>{t("people.col.visits")}</span><span>{t("people.col.balance")}</span><span>{t("people.col.status")}</span>
            </div>
          )}
          {people.map((p) => (
            <Link key={p.id} href={`/b/${slug}/people/${p.id}`} className="person-row">
              <Avatar name={p.name} size={42} />
              <span className="pr-main">
                <span className="pr-name">{p.name}{p.alert && <Icon n="alert" size={15} className="pr-alert" aria-label={t("alert.title")} />}</span>
                <span className="pr-sub">
                  {p.phone && <bdi dir="ltr">{p.phone}</bdi>}
                  {/* Phone: one compact line of what matters */}
                  <span className="pr-meta">
                    {p.next ? <span className="pr-next"><Icon n="calendar" size={13} />{day(p.next.at)} {fmtTime(p.next.at, tz)}</span>
                      : p.last_visit ? <span><Icon n="clock" size={13} />{t("people.last").replace("{d}", day(p.last_visit))}</span>
                      : <span>{t("people.new").replace("{d}", day(p.created_at))}</span>}
                  </span>
                </span>
              </span>
              <span className="pr-col">{p.last_visit ? day(p.last_visit) : <span className="muted">—</span>}</span>
              <span className="pr-col">{p.next ? <span className="pr-next"><b>{day(p.next.at)} {fmtTime(p.next.at, tz)}</b><span className="muted small">{p.next.offering}</span></span> : <span className="muted">—</span>}</span>
              <span className="pr-col">{p.visits}</span>
              <span className="pr-col">{p.balance > 0 ? <span className="tag tag-warn">{shekels(p.balance)}</span> : p.balance < 0 ? <span className="tag tag-good">{t("money.credit")} {shekels(-p.balance)}</span> : <span className="muted">—</span>}</span>
              <span className="pr-end">
                {p.balance > 0 && <span className="tag tag-warn pr-debt">{shekels(p.balance)}</span>}
                <span className={`tag ${p.status === "active" ? "tag-good" : p.status === "lead" ? "tag-lead" : "tag-warn"}`}>{t(`status.${p.status}` as MessageKey)}</span>
              </span>
            </Link>
          ))}
        </section>
      </main>
      <OwnerNav slug={slug} active="people" />
    </>
  );
}
