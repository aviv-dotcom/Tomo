import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import { fmtDate, fmtTime, localDate } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { removeTimeOff } from "../actions";
import { TimeOffForm } from "./TimeOffForm";

export const dynamic = "force-dynamic";
const t = translator("he");
type Off = { id: string; starts_at: string; ends_at: string; note: string | null; conflicts: number };
type Conflict = { id: string; starts_at: string; offering: string; people: number };

export default async function TimeOffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.rpc("list_time_off", { p_business: biz.id });
  const offs = (data ?? []) as Off[];
  const conflicts = await Promise.all(offs.filter((o) => o.conflicts > 0).map(async (o) => {
    const { data: c } = await sb.rpc("time_off_conflicts", { p_time_off: o.id });
    return [o.id, (c ?? []) as Conflict[]] as const;
  }));
  const byOff = new Map(conflicts);
  const tz = biz.timezone;
  const lastDay = (iso: string) => fmtDate(new Date(new Date(iso).getTime() - 1).toISOString(), tz);
  return (
    <>
      <main className="page">
        <Link href={`/b/${slug}/settings`} className="muted small">→ {t("set.title")}</Link>
        <h1 className="h1">{t("off.title")}</h1>
        <p className="sub">{t("off.subtitle")}</p>
        <TimeOffForm business={biz.id} slug={slug} today={localDate(tz)} />
        {offs.length === 0 && <p className="muted">{t("off.empty")}</p>}
        {offs.map((o) => (
          <section key={o.id} className="card">
            <div className="row"><span className="grow"><b>{fmtDate(o.starts_at, tz)} – {lastDay(o.ends_at)}</b>{o.note && <span className="muted small">{o.note}</span>}</span>
              <form action={removeTimeOff}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="slug" value={slug} /><button className="btn btn-secondary btn-small">{t("off.remove")}</button></form></div>
            {(byOff.get(o.id) ?? []).length > 0 && (
              <div className="action"><b className="small">{t("off.conflicts")}</b>
                {(byOff.get(o.id) ?? []).map((c) => (
                  <Link key={c.id} href={`/b/${slug}/calendar/s/${c.id}`} className="list-row link-row">
                    <span className="grow"><span>{c.offering}</span><span className="muted small">{fmtDate(c.starts_at, tz)} · {fmtTime(c.starts_at, tz)} · {c.people}</span></span>
                    <span className="small">{t("off.open")}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
