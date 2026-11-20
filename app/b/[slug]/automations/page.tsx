import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { Toggles } from "./Toggles";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function AutomationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.rpc("list_automations", { p_business: biz.id });
  return (
    <>
      <main className="page">
        <Link href={`/b/${slug}/inbox`} className="muted small">→ {t("back")}</Link>
        <h1 className="h1">{t("auto.title")}</h1>
        <p className="sub">{t("auto.subtitle")}</p>
        <Toggles business={biz.id} slug={slug} state={(data ?? {}) as Record<string, boolean>} />
      </main>
      <OwnerNav slug={slug} active="today" />
    </>
  );
}
