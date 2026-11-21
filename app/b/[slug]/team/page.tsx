import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { fmtDate } from "@/lib/time";
import { OwnerNav } from "@/components/OwnerNav";
import { Back, Icon, IconTile, Title } from "@/components/Icon";
import { InviteForm } from "./InviteForm";
import { removeMember, revokeInvite } from "./actions";

export const dynamic = "force-dynamic";
const t = translator("he");
type Team = { members: { user_id: string; email: string; role: string; me: boolean }[]; invites: { id: string; email: string; created_at: string }[] };

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const [{ data }, { data: role }] = await Promise.all([sb.rpc("list_team", { p_business: biz.id }), sb.rpc("core_role", { p_business: biz.id })]);
  const team = (data ?? { members: [], invites: [] }) as Team;
  const isOwner = role === "owner";
  return (
    <>
      <main className="page">
        <Back href={`/b/${slug}/settings`} label={t("set.title")} />
        <h1 className="h1">{t("team.title")}</h1>
        <p className="sub">{t("team.subtitle")}</p>
        <section className="card" style={{ gap: 0 }}>
          <Title n="users" style={{ marginBottom: 6 }}>{t("team.members")}</Title>
          {team.members.map((m) => (
            <div key={m.user_id} className="list-row">
              <IconTile n={m.role === "owner" ? "shield" : "user"} tone={m.role === "owner" ? "accent" : "plain"} size={34} />
              <span className="grow"><span className="input-ltr" style={{ textAlign: "start" }}>{m.email}</span><span className="muted small">{t(`role.${m.role}` as MessageKey)}{m.me ? ` · ${t("team.you")}` : ""}</span></span>
              {isOwner && m.role !== "owner" && (
                <form action={removeMember}><input type="hidden" name="business" value={biz.id} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="user" value={m.user_id} />
                  <button className="btn btn-secondary btn-small" aria-label={t("team.remove")} title={t("team.remove")}><Icon n="trash" /></button></form>
              )}
            </div>
          ))}
        </section>
        {isOwner && team.invites.length > 0 && (
          <section className="card" style={{ gap: 0 }}>
            <Title n="mail" style={{ marginBottom: 6 }}>{t("team.pending")}</Title>
            {team.invites.map((i) => (
              <div key={i.id} className="list-row">
                <span className="grow"><span className="input-ltr" style={{ textAlign: "start" }}>{i.email}</span><span className="muted small">{fmtDate(i.created_at, biz.timezone)}</span></span>
                <form action={revokeInvite}><input type="hidden" name="invite" value={i.id} /><input type="hidden" name="slug" value={slug} />
                  <button className="btn btn-secondary btn-small"><Icon n="x" />{t("team.revoke")}</button></form>
              </div>
            ))}
          </section>
        )}
        {isOwner && <InviteForm business={biz.id} slug={slug} businessName={biz.name} />}
        <section className="card">
          <Title n="info">{t("team.roles")}</Title>
          <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>{t("team.roles.body")}</p>
        </section>
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
