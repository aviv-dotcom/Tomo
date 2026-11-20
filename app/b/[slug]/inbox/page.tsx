import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { loadInbox } from "@/lib/inbox";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { ActionCard } from "@/components/ActionCard";
import { Back, Empty, Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function InboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const items = await loadInbox(sb, biz, 200);
  return (
    <>
      <main className="page">
        <Back href={`/b/${slug}`} label={t("back")} />
        <h1 className="h1">{t("act.title")}</h1>
        {items.length === 0 && <div className="card"><Empty n="check" text={t("act.empty")} /></div>}
        {items.map((i) => <ActionCard key={i.action.id} action={i.action} text={i.text} slug={slug} />)}
        <Link className="small muted meta" href={`/b/${slug}/automations`}><Icon n="zap" size={14} />{t("act.settings")}</Link>
      </main>
      <OwnerNav slug={slug} active="today" />
    </>
  );
}
