import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shekels, whatsappLink } from "@/lib/format";
import { fmtDate } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { Avatar, Empty, Icon, IconTile, Title } from "@/components/Icon";

export const dynamic = "force-dynamic";
const t = translator("he");

type Summary = { collected_month: number; charged_month: number;
  debtors: { id: string; name: string; phone: string | null; balance: number }[];
  recent: { id: string; name: string; person_id: string; amount: number; method: string; paid_at: string }[] };

export default async function MoneyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.rpc("money_summary", { p_business: biz.id });
  const m = (data ?? { collected_month: 0, charged_month: 0, debtors: [], recent: [] }) as Summary;
  const debt = m.debtors.reduce((a, d) => a + d.balance, 0);
  const remind = (name: string, amount: number) => t("money.remind.msg").replace("{name}", name.split(" ")[0]).replace("{amount}", shekels(amount)).replace("{business}", biz.name);
  return (
    <>
      <main className="page page-wide">
        <div className="top"><h1 className="h1">{t("money.title")}</h1><span className="row" style={{ gap: 6 }}><Link className="btn btn-secondary btn-small" href={`/b/${slug}/orders`}><Icon n="tag" />{t("order.list")}</Link><Link className="btn btn-secondary btn-small" href={`/b/${slug}/reports`}><Icon n="trend" />{t("rep.title")}</Link></span></div>
        <div className="kpis">
          <div className="kpi"><span className="kpi-label"><Icon n="trend" size={15} />{t("money.collected")}</span><b>{shekels(m.collected_month)}</b></div>
          <div className="kpi"><span className="kpi-label"><Icon n="alert" size={15} />{t("money.debt")}</span><b>{shekels(debt)}</b></div>
        </div>
<div className="cols">
        <section className="card" style={{ gap: 0 }}>
          <Title n="alert" style={{ marginBottom: 6 }}>{t("money.debtors")}</Title>
          {m.debtors.length === 0 && <Empty n="check" text={t("money.nodebt")} />}
          {m.debtors.map((d) => (
            <div key={d.id} className="list-row">
              <Avatar name={d.name} size={34} />
              <Link href={`/b/${slug}/people/${d.id}#money`} className="grow" style={{ color: "inherit", textDecoration: "none" }}>
                <span>{d.name}</span><span className="price">{shekels(d.balance)}</span></Link>
              {d.phone && <a className="btn btn-secondary btn-small" href={whatsappLink(d.phone, remind(d.name, d.balance))} target="_blank" rel="noopener noreferrer" aria-label={t("money.remind")} title={t("money.remind")}><Icon n="chat" /></a>}
              <Link className="btn btn-primary btn-small" href={`/b/${slug}/people/${d.id}#money`}><Icon n="plus" />{t("money.record")}</Link>
            </div>
          ))}
        </section>
        <section className="card" style={{ gap: 0 }}>
          <Title n="receipt" style={{ marginBottom: 6 }}>{t("money.recent")}</Title>
          {m.recent.length === 0 && <Empty n="money" text={t("money.norecent")} />}
          {m.recent.map((r) => (
            <Link key={r.id} href={`/b/${slug}/people/${r.person_id}#money`} className="list-row link-row">
              <IconTile n={r.method === "refund" ? "undo" : "money"} tone={r.method === "refund" ? "warn" : "good"} size={34} />
              <span className="grow"><span>{r.name}</span><span className="muted small">{fmtDate(r.paid_at, biz.timezone)} · {t(`method.${r.method}` as MessageKey)}</span></span>
              <span className="price">{shekels(r.amount)}</span>
            </Link>
          ))}
        </section>
</div>
      </main>
      <OwnerNav slug={slug} active="money" />
    </>
  );
}
