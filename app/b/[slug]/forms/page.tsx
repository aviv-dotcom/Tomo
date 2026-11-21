import Link from "next/link";
import { requireBusiness } from "@/lib/biz";
import { backTarget } from "@/lib/back";
import { translator } from "@/lib/i18n";
import { OwnerNav } from "@/components/OwnerNav";
import { FormSettings } from "./FormSettings";
import { Back } from "@/components/Icon";
import { OwnerOnly } from "@/components/OwnerOnly";

export const dynamic = "force-dynamic";
const t = translator("he");

export default async function FormsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ back?: string }> }) {
  const { slug } = await params;
  const ret = backTarget(slug, (await searchParams).back);
  const { sb, biz, isOwner } = await requireBusiness(slug);
  if (!isOwner) return <OwnerOnly slug={slug} title="forms.title" />;
  const { data } = await sb.from("business_forms").select("enabled, questions").eq("business_id", biz.id).maybeSingle();
  return (
    <>
      <main className="page">
        <Back href={ret.href} label={ret.label} />
        <h1 className="h1">{t("forms.title")}</h1>
        <p className="sub">{t("forms.subtitle")}</p>
        <FormSettings business={biz.id} slug={slug} back={ret} enabled={!!data?.enabled} questions={(data?.questions ?? []) as string[]} />
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
