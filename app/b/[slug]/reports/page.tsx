import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import { shekels } from "@/lib/format";
import { addDays, localDate } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { Back, Empty, Icon, Title } from "@/components/Icon";

export const dynamic = "force-dynamic";
const t = translator("he");
type Report = { collected: number; charged: number; months: { month: string; collected: number }[];
  services: { name: string; amount: number; count: number }[];
  visits: { attended: number; no_show: number; cancelled_client: number; cancelled_business: number; from_page: number };
  people: { new: number; leads: number; from_page: number } };

const RANGES = ["month", "last", "90"] as const;
const RANGE_KEY = { month: "rep.range.month", last: "rep.range.last", "90": "rep.range.90" } as const;

/** Money, visits and clients over a period, and files to take to the accountant. */
export default async function ReportsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ r?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const r = RANGES.find((x) => x === sp.r) ?? "month";
  const { sb, biz } = await requireBusiness(slug);
  const today = localDate(biz.timezone);
  const first = `${today.slice(0, 8)}01`;
  const prevFirst = addDays(first, -1).slice(0, 8) + "01";
  const [from, to] = r === "month" ? [first, today] : r === "last" ? [prevFirst, addDays(first, -1)] : [addDays(today, -89), today];
  const { data, error } = await sb.rpc("business_report", { p_business: biz.id, p_from: from, p_to: to });
  const rep = data as Report | null;
  const max = Math.max(1, ...(rep?.months ?? []).map((m) => m.collected));
  const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("he-IL", { month: "short" });
  const v = rep?.visits;
  const totalVisits = v ? v.attended + v.no_show : 0;
  return (
    <>
      <main className="page page-wide">
        <Back href={`/b/${slug}/money`} label={t("nav.money")} />
        <h1 className="h1">{t("rep.title")}</h1>
        <div className="chips">
          {RANGES.map((x) => <Link key={x} className={`chip ${x === r ? "chip-on" : ""}`} href={`/b/${slug}/reports?r=${x}`}>{t(RANGE_KEY[x])}</Link>)}
        </div>
        {error || !rep ? <p className="error">{t("err.not_allowed")}</p> : (
          <>
            <div className="kpis">
              <div className="kpi"><span className="kpi-label"><Icon n="trend" size={15} />{t("rep.collected")}</span><b>{shekels(rep.collected)}</b></div>
              <div className="kpi"><span className="kpi-label"><Icon n="receipt" size={15} />{t("rep.charged")}</span><b>{shekels(rep.charged)}</b></div>
              <div className="kpi"><span className="kpi-label"><Icon n="check" size={15} />{t("rep.visits")}</span><b>{v?.attended ?? 0}</b></div>
              <div className="kpi"><span className="kpi-label"><Icon n="userPlus" size={15} />{t("rep.new_people")}</span><b>{rep.people.new}</b></div>
            </div>

<div className="cols">
            <section className="card">
              <Title n="trend">{t("rep.months")}</Title>
              {rep.months.length === 0 ? <Empty n="money" text={t("rep.empty")} /> : (
                <div className="bars" role="img" aria-label={t("rep.months")}>
                  {rep.months.map((m) => (
                    <div key={m.month} className="bar">
                      <span className="bar-val">{shekels(m.collected)}</span>
                      <span className="bar-fill" style={{ height: `${Math.max(4, Math.round((m.collected / max) * 120))}px` }} />
                      <span className="bar-label">{monthName(m.month)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card" style={{ gap: 0 }}>
              <Title n="tag" style={{ marginBottom: 6 }}>{t("rep.services")}</Title>
              {rep.services.length === 0 && <Empty n="tag" text={t("rep.empty")} />}
              {rep.services.map((s) => (
                <div key={s.name} className="list-row"><span className="grow"><span>{s.name}</span><span className="muted small">{t("rep.times").replace("{n}", String(s.count))}</span></span><span className="price">{shekels(s.amount)}</span></div>
              ))}
            </section>

            <section className="card" style={{ gap: 0 }}>
              <Title n="calendar" style={{ marginBottom: 6 }}>{t("rep.attendance")}</Title>
              {([["rep.attended", v?.attended], ["rep.no_show", v?.no_show], ["rep.cancel_client", v?.cancelled_client], ["rep.cancel_business", v?.cancelled_business], ["rep.from_page", v?.from_page]] as const).map(([k, n]) => (
                <div key={k} className="list-row" style={{ minHeight: 40 }}><span className="grow">{t(k)}</span><b style={{ fontVariantNumeric: "tabular-nums" }}>{n ?? 0}</b></div>
              ))}
              {totalVisits > 0 && <p className="muted small" style={{ margin: "8px 0 0" }}>{t("rep.noshow_rate").replace("{p}", String(Math.round(((v?.no_show ?? 0) / totalVisits) * 100)))}</p>}
            </section>

            <section className="card" style={{ gap: 0 }}>
              <Title n="users" style={{ marginBottom: 6 }}>{t("rep.people")}</Title>
              {([["rep.new_people", rep.people.new], ["rep.leads", rep.people.leads], ["rep.people_page", rep.people.from_page]] as const).map(([k, n]) => (
                <div key={k} className="list-row" style={{ minHeight: 40 }}><span className="grow">{t(k)}</span><b>{n}</b></div>
              ))}
            </section>

            <section className="card">
              <Title n="download">{t("rep.export")}</Title>
              <p className="muted small" style={{ margin: 0 }}>{t("rep.export.hint")}</p>
              <div className="row btn-row">
                <a className="btn btn-secondary btn-small" href={`/b/${slug}/export/payments?from=${from}&to=${to}`}><Icon n="download" />{t("rep.export.payments")}</a>
                <a className="btn btn-secondary btn-small" href={`/b/${slug}/export/charges?from=${from}&to=${to}`}><Icon n="download" />{t("rep.export.charges")}</a>
                <a className="btn btn-secondary btn-small" href={`/b/${slug}/export/clients`}><Icon n="download" />{t("rep.export.clients")}</a>
              </div>
            </section>
</div>
          </>
        )}
      </main>
      <OwnerNav slug={slug} active="money" />
    </>
  );
}
