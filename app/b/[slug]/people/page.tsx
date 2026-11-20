import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { OwnerNav } from "@/components/OwnerNav";
import { AddPerson } from "../AddPerson";

export const dynamic = "force-dynamic";
const t = translator("he");
const STATUSES = ["active", "lead", "paused", "left"] as const;

export default async function PeoplePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; s?: string; add?: string }> }) {
  const { slug } = await params;
  const { q = "", s, add } = await searchParams;
  const status = STATUSES.find((x) => x === s) ?? null;
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.rpc("list_people", { p_business: biz.id, p_search: q || null, p_status: status });
  const people = (data ?? []) as { id: string; name: string; phone: string | null; status: string }[];
  const href = (st: string | null) => `/b/${slug}/people?${new URLSearchParams({ ...(q ? { q } : {}), ...(st ? { s: st } : {}) })}`;
  return (
    <>
      <main className="page">
        <details className="adder" open={add === "1"}>
          <summary className="top"><h1 className="h1">{t("people.title")}</h1><span className="btn btn-primary btn-small">{t("people.add")}</span></summary>
          <section className="card" style={{ marginTop: 12 }}><h2 className="card-title">{t("people.add.title")}</h2><AddPerson business={biz.id} slug={slug} /></section>
        </details>
        <form className="row" action={`/b/${slug}/people`}>
          {status && <input type="hidden" name="s" value={status} />}
          <input className="input" style={{ flex: 1 }} name="q" defaultValue={q} placeholder={t("people.search")} aria-label={t("people.search")} />
        </form>
        <div className="chips">
          <Link className={`chip ${!status ? "chip-on" : ""}`} href={href(null)}>{t("people.all")}</Link>
          {STATUSES.map((st) => <Link key={st} className={`chip ${status === st ? "chip-on" : ""}`} href={href(st)}>{t(`status.${st}` as MessageKey)}</Link>)}
        </div>
        <section className="card" style={{ gap: 0 }}>
          {people.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("people.empty")}</p>}
          {people.map((p) => (
            <Link key={p.id} href={`/b/${slug}/people/${p.id}`} className="list-row link-row">
              <span className="grow"><span>{p.name}</span>{p.phone && <span className="muted small input-ltr" style={{ textAlign: "start" }}>{p.phone}</span>}</span>
              <span className={`tag ${p.status === "active" ? "tag-good" : "tag-warn"}`}>{t(`status.${p.status}` as MessageKey)}</span>
            </Link>
          ))}
        </section>
      </main>
      <OwnerNav slug={slug} active="people" />
    </>
  );
}
