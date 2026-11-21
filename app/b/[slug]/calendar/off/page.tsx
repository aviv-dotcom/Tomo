import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import { fmtDate, fmtTime, localDate } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { removeTimeOff } from "../actions";
import { TimeOffForm } from "./TimeOffForm";
import { Back, Empty, Icon, IconTile } from "@/components/Icon";
import { OwnerOnly } from "@/components/OwnerOnly";

export const dynamic = "force-dynamic";
const t = translator("he");
type Off = { id: string; starts_at: string; ends_at: string; note: string | null; conflicts: number; provider: string | null };
type Conflict = { id: string; starts_at: string; offering: string; people: number };

export default async function TimeOffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz, isOwner } = await requireBusiness(slug);
  if (!isOwner) return <OwnerOnly slug={slug} title="off.title" />;
  const { data } = await sb.rpc("list_time_off", { p_business: biz.id });
  const offs = (data ?? []) as Off[];
  const { data: provData } = await sb.rpc("list_providers", { p_business: biz.id });
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
        <Back href={`/b/${slug}/settings`} label={t("set.title")} />
        <h1 className="h1">{t("off.title")}</h1>
        <p className="sub">{t("off.subtitle")}</p>
        <TimeOffForm business={biz.id} slug={slug} today={localDate(tz)} providers={((provData ?? []) as { id: string; name: string; active: boolean }[]).filter((x) => x.active)} />
        {offs.length === 0 && <div className="card"><Empty n="sun" text={t("off.empty")} /></div>}
        {offs.map((o) => (
          <section key={o.id} className="card">
            <div className="row"><IconTile n="calendarOff" /><span className="grow"><b>{fmtDate(o.starts_at, tz)} – {lastDay(o.ends_at)}</b>{(o.note || o.provider) && <span className="muted small">{[o.provider, o.note].filter(Boolean).join(" · ")}</span>}</span>
              <form action={removeTimeOff}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="slug" value={slug} /><button className="btn btn-secondary btn-small" aria-label={t("off.remove")} title={t("off.remove")}><Icon n="trash" /></button></form></div>
            {(byOff.get(o.id) ?? []).length > 0 && (
              <div className="action"><b className="small title-in"><Icon n="alert" size={15} />{t("off.conflicts")}</b>
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
