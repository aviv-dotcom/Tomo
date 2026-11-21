import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { Back, Empty, Title } from "@/components/Icon";
import { OrdersList, type Order } from "@/components/OrdersList";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function OrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.rpc("list_orders", { p_business: biz.id });
  const orders = (data ?? []) as Order[];
  const open = orders.filter((o) => o.open), past = orders.filter((o) => !o.open);
  return (
    <>
      <main className="page">
        <Back href={`/b/${slug}/money`} label={t("nav.money")} />
        <h1 className="h1">{t("order.list")}</h1>
        <p className="sub">{t("order.list.sub")}</p>
        <section className="card" style={{ gap: 0 }}>
          <Title n="inbox" style={{ marginBottom: 6 }}>{t("order.open")}</Title>
          {open.length === 0 ? <Empty n="check" text={t("order.none")} /> : <OrdersList slug={slug} timezone={biz.timezone} orders={open} />}
        </section>
        {past.length > 0 && (
          <section className="card" style={{ gap: 0 }}>
            <Title n="receipt" style={{ marginBottom: 6 }}>{t("order.past")}</Title>
            <OrdersList slug={slug} timezone={biz.timezone} orders={past} />
          </section>
        )}
      </main>
      <OwnerNav slug={slug} active="money" />
    </>
  );
}
