import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { OwnerOnly } from "@/components/OwnerOnly";
import { Back, Icon } from "@/components/Icon";
import type { Provider } from "./ProviderForm";
import { ProvidersList } from "./ProvidersList";

export const dynamic = "force-dynamic";
const t = translator("he");

/** The people who take appointments. With nobody here, the business has one shared calendar. */
export default async function ProvidersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz, isOwner } = await requireBusiness(slug);
  if (!isOwner) return <OwnerOnly slug={slug} title="prov.title" />;
  const [{ data }, { data: offs }] = await Promise.all([
    sb.rpc("list_providers", { p_business: biz.id }),
    sb.from("offerings").select("id, name").eq("business_id", biz.id).eq("delivery", "appointment").eq("active", true).order("position"),
  ]);
  return (
    <>
      <main className="page">
        <Back href={`/b/${slug}/settings`} label={t("set.title")} />
        <h1 className="h1">{t("prov.title")}</h1>
        <p className="sub">{t("prov.subtitle")}</p>
        <p className="small row" style={{ margin: 0, background: "var(--accent-soft)", padding: 10, borderRadius: 10, alignItems: "start" }}><Icon n="info" size={16} /><span>{t("prov.how")}</span></p>
        <ProvidersList business={biz.id} slug={slug} providers={(data ?? []) as Provider[]} offerings={(offs ?? []) as { id: string; name: string }[]} />
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
