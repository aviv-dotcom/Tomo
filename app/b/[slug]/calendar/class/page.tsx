import { requireBusiness } from "@/lib/biz";
import { ClassForm } from "./ClassForm";
import { OwnerOnly } from "@/components/OwnerOnly";

export const dynamic = "force-dynamic";

export default async function ClassPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, biz, isOwner } = await requireBusiness(slug);
  if (!isOwner) return <OwnerOnly slug={slug} title="class.title" />;
  const { data } = await sb.from("offerings").select("id, name").eq("business_id", biz.id).eq("delivery", "class").eq("active", true).order("position");
  return <ClassForm business={biz.id} slug={slug} offerings={(data ?? []) as { id: string; name: string }[]} />;
}
