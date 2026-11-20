import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { loadInbox } from "@/lib/inbox";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { ActionCard } from "@/components/ActionCard";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function InboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const items = await loadInbox(sb, biz, 200);
  return (
    <>
      <main className="page">
        <Link href={`/b/${slug}`} className="muted small">→ {t("back")}</Link>
        <div className="top"><h1 className="h1">{t("act.title")}</h1><Link className="small" href={`/b/${slug}/automations`}>{t("act.settings")}</Link></div>
        {items.length === 0 && <p className="muted">{t("act.empty")}</p>}
        {items.map((i) => <ActionCard key={i.action.id} action={i.action} text={i.text} slug={slug} />)}
      </main>
      <OwnerNav slug={slug} active="today" />
    </>
  );
}
