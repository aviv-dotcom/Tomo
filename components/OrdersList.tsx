import Link from "next/link";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { shekels } from "@/lib/format";
import { fmtDate, fmtTime } from "@/lib/time";
import { Avatar, Icon } from "@/components/Icon";
import { setOrderStatus } from "@/app/b/[slug]/orders/actions";

const t = translator("he");
export type Order = { id: string; status: string; note: string | null; total: number; created_at: string; open: boolean;
  person: { id: string; name: string; phone: string | null }; items: { name: string; qty: number; price: number }[] };

/** Orders with the next step as a button: ready, handed over (charges the client), or cancel. */
export function OrdersList({ slug, timezone, orders }: { slug: string; timezone: string; orders: Order[] }) {
  const step = (o: Order, status: string, label: MessageKey, primary = false, icon: "check" | "x" | "clock" = "check") => (
    <form action={setOrderStatus}><input type="hidden" name="order" value={o.id} /><input type="hidden" name="status" value={status} /><input type="hidden" name="slug" value={slug} />
      <button className={`btn btn-small ${primary ? "btn-primary" : "btn-secondary"}`}><Icon n={icon} />{t(label)}</button></form>
  );
  return (
    <>
      {orders.map((o) => (
        <div key={o.id} className="list-row" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
          <Avatar name={o.person.name} size={34} />
          <Link href={`/b/${slug}/people/${o.person.id}`} className="grow" style={{ color: "inherit", textDecoration: "none" }}>
            <span>{o.person.name}</span>
            <span className="small">{o.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(" + ")}</span>
            <span className="muted small">{fmtDate(o.created_at, timezone)} {fmtTime(o.created_at, timezone)}{o.note ? ` · ${o.note}` : ""}</span>
          </Link>
          <span className="price">{shekels(o.total)}</span>
          <span className={`tag ${o.status === "done" ? "tag-good" : o.status === "cancelled" ? "tag-warn" : ""}`}>{t(`order.status.${o.status}` as MessageKey)}</span>
          {o.open && (
            <div className="row btn-row" style={{ width: "100%" }}>
              {o.status === "new" && step(o, "ready", "order.mark_ready", false, "clock")}
              {step(o, "done", "order.mark_done", true)}
              {step(o, "cancelled", "order.cancel", false, "x")}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
