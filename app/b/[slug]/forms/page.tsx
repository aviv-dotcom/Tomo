import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { FormSettings } from "./FormSettings";
import { Back } from "@/components/Icon";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function FormsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz } = await requireBusiness(slug);
  const { data } = await sb.from("business_forms").select("enabled, questions").eq("business_id", biz.id).maybeSingle();
  return (
    <>
      <main className="page">
        <Back href={`/b/${slug}/settings`} label={t("set.title")} />
        <h1 className="h1">{t("forms.title")}</h1>
        <p className="sub">{t("forms.subtitle")}</p>
        <FormSettings business={biz.id} slug={slug} enabled={!!data?.enabled} questions={(data?.questions ?? []) as string[]} />
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
