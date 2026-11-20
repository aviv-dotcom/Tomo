import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shekels, whatsappLink } from "@/lib/format";
import { fmtDate } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";

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
      <main className="page">
        <h1 className="h1">{t("money.title")}</h1>
        <div className="kpis">
          <div className="kpi"><span className="muted small">{t("money.collected")}</span><b>{shekels(m.collected_month)}</b></div>
          <div className="kpi"><span className="muted small">{t("money.debt")}</span><b>{shekels(debt)}</b></div>
        </div>
        <section className="card" style={{ gap: 0 }}>
          <h2 className="card-title" style={{ marginBottom: 6 }}>{t("money.debtors")}</h2>
          {m.debtors.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("money.nodebt")}</p>}
          {m.debtors.map((d) => (
            <div key={d.id} className="list-row">
              <Link href={`/b/${slug}/people/${d.id}#money`} className="grow" style={{ color: "inherit", textDecoration: "none" }}>
                <span>{d.name}</span><span className="price">{shekels(d.balance)}</span></Link>
              {d.phone && <a className="btn btn-secondary btn-small" href={whatsappLink(d.phone, remind(d.name, d.balance))} target="_blank" rel="noopener noreferrer">{t("money.remind")}</a>}
              <Link className="btn btn-primary btn-small" href={`/b/${slug}/people/${d.id}#money`}>{t("money.record")}</Link>
            </div>
          ))}
        </section>
        <section className="card" style={{ gap: 0 }}>
          <h2 className="card-title" style={{ marginBottom: 6 }}>{t("money.recent")}</h2>
          {m.recent.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("money.norecent")}</p>}
          {m.recent.map((r) => (
            <Link key={r.id} href={`/b/${slug}/people/${r.person_id}#money`} className="list-row link-row">
              <span className="grow"><span>{r.name}</span><span className="muted small">{fmtDate(r.paid_at, biz.timezone)} · {t(`method.${r.method}` as MessageKey)}</span></span>
              <span className="price">{shekels(r.amount)}</span>
            </Link>
          ))}
        </section>
      </main>
      <OwnerNav slug={slug} active="money" />
    </>
  );
}
