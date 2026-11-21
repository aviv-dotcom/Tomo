import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate, fmtTime } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { PersonForm } from "./PersonForm";
import { NotesForm, SellPass } from "./PassForms";
import { cancelPass, removePhoto } from "./actions";
import { AlertEditor, PhotoUploader } from "@/components/VisitForms";
import { ForgetButton } from "./ForgetButton";
import { ChargeForm, PaymentForm } from "./MoneyForms";
import { voidCharge } from "../../money/actions";
import { shekels, whatsappLink } from "@/lib/format";
import { Avatar, Back, Empty, Icon, IconTile, Title } from "@/components/Icon";

export const dynamic = "force-dynamic";
const t = translator("he");

type Card = { id: string; name: string; phone: string | null; email: string | null; status: string; marketing_consent: boolean; notes: string | null; alert: string | null;
  messages: { kind: string; at: string }[]; waiting: { id: string; date: string; part: string; offering: string }[];
  visits: number; no_shows: number; bookings: { id: string; session_id: string; starts_at: string; offering: string; status: string; summary: string | null }[] };

export default async function PersonPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { sb, biz, isOwner: owner } = await requireBusiness(slug);
  const { data, error } = await sb.rpc("person_card", { p_person: id });
  if (error || !data) notFound();
  const p = data as Card;
  const [{ data: moneyData }, { data: formData }, { data: passData }, { data: passOfferings }, { data: role }] = await Promise.all([
    sb.rpc("person_money", { p_person: id }), sb.rpc("person_form", { p_person: id }), sb.rpc("person_passes", { p_person: id }),
    sb.from("offerings").select("id, name, price_agorot").eq("business_id", biz.id).eq("active", true).in("billing", ["pack", "subscription"]).in("delivery", ["class", "appointment"]).order("position"),
    sb.rpc("core_role", { p_business: biz.id }),
  ]);
  const passes = (passData ?? []) as { id: string; name: string; kind: string; entries: number | null; left: number | null; used: number; expires_on: string | null; status: string; expired: boolean }[];
  const isOwner = role === "owner";
  // Before / after photos: private files, shown through links that expire in 10 minutes.
  const { data: photoRows } = await sb.from("person_photos").select("id, path, kind, booking_id, created_at").eq("person_id", id).order("created_at", { ascending: false }).limit(60);
  const photoList = (photoRows ?? []) as { id: string; path: string; kind: string; booking_id: string | null; created_at: string }[];
  const { data: signed } = photoList.length ? await sb.storage.from("client-media").createSignedUrls(photoList.map((x) => x.path), 600) : { data: [] };
  const photoUrl = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const form = formData as { questions: string[]; answers: boolean[]; details: string | null; signed_at: string } | null;
  const money = (moneyData ?? { balance: 0, lines: [] }) as { balance: number;
    lines: { type: "charge" | "payment"; id: string; text: string; method?: string; amount: number; void: boolean; at: string }[] };
  return (
    <>
      <main className="page page-wide">
        <Back href={`/b/${slug}/people`} label={t("back")} />
        <div className="top"><Avatar name={p.name} size={52} /><div className="grow"><h1 className="h1">{p.name}</h1>
          <span className="small"><span className={`tag ${p.status === "active" ? "tag-good" : "tag-warn"}`}>{t(`status.${p.status}` as MessageKey)}</span>
            {p.phone && <span className="muted input-ltr" dir="ltr" style={{ marginInlineStart: 8 }}>{p.phone}</span>}</span></div></div>
        <AlertEditor person={p.id} slug={slug} alert={p.alert} />
        <div className="row btn-row">
          <Link className="btn btn-primary btn-small" style={{ flex: 1 }} href={`/b/${slug}/calendar/new?person=${p.id}`}><Icon n="calendarPlus" />{t("card.book")}</Link>
          {p.phone && <a className="btn btn-secondary btn-small" style={{ flex: 1 }} href={whatsappLink(p.phone)} target="_blank" rel="noopener"><Icon n="chat" />{t("card.whatsapp")}</a>}
          {p.phone && <a className="btn btn-secondary btn-small" style={{ flex: 1 }} href={`tel:${p.phone}`}><Icon n="phone" />{t("card.call")}</a>}
        </div>
        <div className="kpis">
          <div className="kpi"><span className="kpi-label"><Icon n="check" size={15} />{t("card.visits")}</span><b>{p.visits}</b></div>
          <div className="kpi"><span className="kpi-label"><Icon n="ban" size={15} />{t("card.noshows")}</span><b>{p.no_shows}</b></div>
        </div>
<div className="cols">
        <section className="card" style={{ gap: 0 }}>
          <Title n="calendar" style={{ marginBottom: 6 }}>{t("card.history")}</Title>
          {p.bookings.length === 0 && <Empty n="calendar" text={t("card.history.empty")} />}
          {p.bookings.map((b) => (
            <Link key={b.id} href={`/b/${slug}/calendar/s/${b.session_id}`} className="list-row link-row">
              <span className="grow"><span>{b.offering}</span><span className="muted small">{fmtDate(b.starts_at, biz.timezone)} · {fmtTime(b.starts_at, biz.timezone)}</span>
                {b.summary && <span className="summary-line">{b.summary}</span>}</span>
              <span className="tag">{t(`bstatus.${b.status}` as MessageKey)}</span>
            </Link>
          ))}
        </section>
        <section className="card">
          <Title n="image" extra={<span className="muted small">{photoList.length}</span>}>{t("photo.title")}</Title>
          <p className="muted small row" style={{ margin: 0 }}><Icon n="shield" size={14} />{t("photo.private")}</p>
          {photoList.length === 0 ? <p className="muted small" style={{ margin: 0 }}>{t("photo.empty")}</p> : (
            <div className="photos">
              {photoList.map((f) => (
                <div key={f.id} className="photo">
                  {photoUrl.get(f.path) && <a href={photoUrl.get(f.path)!} target="_blank" rel="noopener noreferrer"><img src={photoUrl.get(f.path)!} alt={t(`photo.${f.kind}` as MessageKey)} loading="lazy" /></a>}
                  <span className="photo-tag">{t(`photo.${f.kind}` as MessageKey)} · {fmtDate(f.created_at, biz.timezone)}</span>
                  <form action={removePhoto}><input type="hidden" name="photo" value={f.id} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="person" value={p.id} />
                    <button className="photo-x" aria-label={t("photo.remove")} title={t("photo.remove")}><Icon n="x" size={14} /></button></form>
                </div>
              ))}
            </div>
          )}
          <PhotoUploader business={biz.id} slug={slug} person={p.id} booking={p.bookings.find((b) => b.status === "attended" || b.status === "booked")?.id} />
        </section>
        <section className="card" id="money">
          <Title n="money" extra={            <span className={`tag ${money.balance > 0 ? "tag-warn" : "tag-good"}`}>{money.balance > 0 ? `${t("money.balance")} ${shekels(money.balance)}` : money.balance < 0 ? `${t("money.credit")} ${shekels(-money.balance)}` : t("money.clear")}</span>}>{t("money.section")}</Title>
          <div className="row" style={{ alignItems: "start", flexWrap: "wrap" }}>
            <details className="fold" open={money.balance > 0}><summary className="btn btn-secondary btn-small"><Icon n="money" />{t("money.pay.title")}</summary>
              <PaymentForm business={biz.id} slug={slug} person={p.id} suggested={money.balance} canRefund={owner} /></details>
            <details className="fold"><summary className="btn btn-secondary btn-small"><Icon n="receipt" />{t("money.charge.title")}</summary>
              <ChargeForm business={biz.id} slug={slug} person={p.id} /></details>
          </div>
          {money.lines.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("money.lines.empty")}</p>}
          <div>
            {money.lines.map((l) => (
              <div key={l.id} className="list-row" style={{ opacity: l.void ? 0.5 : 1 }}>
                <IconTile n={l.type === "payment" ? (l.method === "refund" ? "undo" : "money") : "receipt"} tone={l.type === "payment" ? "good" : "plain"} size={32} />
                <span className="grow"><span>{l.type === "payment" ? `${t(`method.${l.method}` as MessageKey)}${l.text !== l.method ? ` · ${l.text}` : ""}` : l.text}</span>
                  <span className="muted small">{fmtDate(l.at, biz.timezone)}{l.void ? ` · ${t("money.voided")}` : ""}</span></span>
                <span className="price" style={{ color: l.type === "payment" ? "var(--good)" : undefined }}>{l.type === "payment" ? "+" : ""}{shekels(Math.abs(l.amount))}</span>
                {owner && l.type === "charge" && !l.void && (
                  <form action={voidCharge}><input type="hidden" name="charge" value={l.id} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="person" value={p.id} />
                    <button className="link-btn" aria-label={t("money.void")} title={t("money.void")}><Icon n="x" size={16} /></button></form>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <Title n="clipboard" extra={<span className={`tag ${form ? "tag-good" : ""}`}>{form ? `${t("card.form.signed")} ${fmtDate(form.signed_at, biz.timezone)}` : t("card.form.none")}</span>}>{t("card.form")}</Title>
          {form && form.questions.map((q, i) => (
            <div key={i} className="row small"><span className="grow">{q}</span><b style={{ color: form.answers[i] ? "var(--bad)" : undefined }}>{form.answers[i] ? t("form.yes") : t("form.no")}</b></div>
          ))}
          {form?.details && <p className="small" style={{ margin: 0, background: "var(--warn-soft)", padding: 8, borderRadius: 8 }}>{form.details}</p>}
        </section>
        <section className="card" style={{ gap: 0 }}>
          <Title n="receipt" style={{ marginBottom: 6 }}>{t("pass.title")}</Title>
          {passes.length === 0 && <p className="muted small" style={{ margin: "0 0 8px" }}>{t("pass.empty")}</p>}
          {passes.map((x) => {
            const live = x.status === "active" && !x.expired && (x.kind === "subscription" || (x.left ?? 0) > 0);
            return (
              <div key={x.id} className="list-row" style={{ opacity: live ? 1 : 0.55 }}>
                <IconTile n={x.kind === "pack" ? "receipt" : "repeat"} tone={live ? "good" : "plain"} size={32} />
                <span className="grow"><span>{x.name}</span>
                  <span className="muted small">{[x.kind === "pack" ? t("pass.left").replace("{left}", String(x.left ?? 0)).replace("{total}", String(x.entries ?? 0)) : t("pass.used").replace("{n}", String(x.used)),
                    x.expires_on ? `${t("pass.until")} ${fmtDate(`${x.expires_on}T12:00:00Z`, biz.timezone)}` : null].filter(Boolean).join(" · ")}</span></span>
                {!live && <span className="tag tag-warn">{x.status === "cancelled" ? t("pass.cancelled") : x.expired ? t("pass.expired") : t("pass.finished")}</span>}
                {live && isOwner && <form action={cancelPass}><input type="hidden" name="pass" value={x.id} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="person" value={p.id} />
                  <button className="link-btn" aria-label={t("pass.cancel")} title={t("pass.cancel")}><Icon n="x" size={16} /></button></form>}
              </div>
            );
          })}
          <div style={{ paddingTop: 10 }}><SellPass person={p.id} slug={slug} offerings={(passOfferings ?? []) as { id: string; name: string; price_agorot: number }[]} /></div>
        </section>
        <section className="card">
          <Title n="edit">{t("notes.title")}</Title>
          <p className="muted small row" style={{ margin: 0 }}><Icon n="shield" size={14} />{t("notes.private")}</p>
          <NotesForm person={p.id} notes={p.notes} />
        </section>
        {p.waiting.length > 0 && (
          <section className="card" style={{ gap: 0 }}>
            <Title n="clock" style={{ marginBottom: 6 }}>{t("waitlist.title")}</Title>
            {p.waiting.map((w) => <div key={w.id} className="list-row"><span className="grow"><span>{w.offering}</span><span className="muted small">{fmtDate(`${w.date}T12:00:00Z`, biz.timezone)} · {t(`part.${w.part}` as MessageKey)}</span></span></div>)}
          </section>
        )}
        {p.messages.length > 0 && (
          <section className="card" style={{ gap: 0 }}>
            <Title n="send" style={{ marginBottom: 6 }}>{t("card.messages")}</Title>
            {p.messages.map((m, i) => <div key={i} className="list-row" style={{ minHeight: 40 }}><span className="grow small">{t(`act.${m.kind}` as MessageKey)}</span><span className="muted small">{fmtDate(m.at, biz.timezone)} {fmtTime(m.at, biz.timezone)}</span></div>)}
          </section>
        )}
        <PersonForm p={p} slug={slug} />
        <section className="card">
          <Title n="shield">{t("card.privacy")}</Title>
          <div className="row btn-row">
            <a className="btn btn-secondary btn-small" href={`/b/${slug}/people/${p.id}/export`}><Icon n="download" />{t("card.export")}</a>
            {owner && <ForgetButton id={p.id} slug={slug} />}
          </div>
        </section>
</div>
      </main>
      <OwnerNav slug={slug} active="people" />
    </>
  );
}
