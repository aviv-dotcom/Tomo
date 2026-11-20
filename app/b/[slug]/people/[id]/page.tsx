import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate, fmtTime } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { PersonForm } from "./PersonForm";
import { ChargeForm, PaymentForm } from "./MoneyForms";
import { voidCharge } from "../../money/actions";
import { shekels } from "@/lib/format";

export const dynamic = "force-dynamic";
const t = translator("he");

type Card = { id: string; name: string; phone: string | null; email: string | null; status: string; marketing_consent: boolean;
  visits: number; no_shows: number; bookings: { id: string; session_id: string; starts_at: string; offering: string; status: string }[] };

export default async function PersonPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data, error } = await sb.rpc("person_card", { p_person: id });
  if (error || !data) notFound();
  const p = data as Card;
  const { data: moneyData } = await sb.rpc("person_money", { p_person: id });
  const money = (moneyData ?? { balance: 0, lines: [] }) as { balance: number;
    lines: { type: "charge" | "payment"; id: string; text: string; method?: string; amount: number; void: boolean; at: string }[] };
  return (
    <>
      <main className="page">
        <Link href={`/b/${slug}/people`} className="muted small">→ {t("back")}</Link>
        <div className="top"><h1 className="h1">{p.name}</h1>
          <Link className="btn btn-primary btn-small" href={`/b/${slug}/calendar/new?person=${p.id}`}>{t("card.book")}</Link></div>
        <div className="kpis">
          <div className="kpi"><span className="muted small">{t("card.visits")}</span><b>{p.visits}</b></div>
          <div className="kpi"><span className="muted small">{t("card.noshows")}</span><b>{p.no_shows}</b></div>
        </div>
        <section className="card" style={{ gap: 0 }}>
          <h2 className="card-title" style={{ marginBottom: 6 }}>{t("card.history")}</h2>
          {p.bookings.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("card.history.empty")}</p>}
          {p.bookings.map((b) => (
            <Link key={b.id} href={`/b/${slug}/calendar/s/${b.session_id}`} className="list-row link-row">
              <span className="grow"><span>{b.offering}</span><span className="muted small">{fmtDate(b.starts_at, biz.timezone)} · {fmtTime(b.starts_at, biz.timezone)}</span></span>
              <span className="tag">{t(`bstatus.${b.status}` as MessageKey)}</span>
            </Link>
          ))}
        </section>
        <section className="card" id="money">
          <h2 className="card-title">{t("money.section")}
            <span className={`tag ${money.balance > 0 ? "tag-warn" : "tag-good"}`}>{money.balance > 0 ? `${t("money.balance")} ${shekels(money.balance)}` : money.balance < 0 ? `${t("money.credit")} ${shekels(-money.balance)}` : t("money.clear")}</span></h2>
          <PaymentForm business={biz.id} slug={slug} person={p.id} suggested={money.balance} />
          <ChargeForm business={biz.id} slug={slug} person={p.id} />
          {money.lines.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("money.lines.empty")}</p>}
          <div>
            {money.lines.map((l) => (
              <div key={l.id} className="list-row" style={{ opacity: l.void ? 0.5 : 1 }}>
                <span className="grow"><span>{l.type === "payment" ? `${t(`method.${l.method}` as MessageKey)}${l.text !== l.method ? ` · ${l.text}` : ""}` : l.text}</span>
                  <span className="muted small">{fmtDate(l.at, biz.timezone)}{l.void ? ` · ${t("money.voided")}` : ""}</span></span>
                <span className="price" style={{ color: l.type === "payment" ? "var(--good)" : undefined }}>{l.type === "payment" ? "+" : ""}{shekels(Math.abs(l.amount))}</span>
                {l.type === "charge" && !l.void && (
                  <form action={voidCharge}><input type="hidden" name="charge" value={l.id} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="person" value={p.id} />
                    <button className="link-btn" aria-label={t("money.void")} title={t("money.void")}>✕</button></form>
                )}
              </div>
            ))}
          </div>
        </section>
        <PersonForm p={p} slug={slug} />
      </main>
      <OwnerNav slug={slug} active="people" />
    </>
  );
}
