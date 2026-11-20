import { redirect } from "next/navigation";
import { getForm, getManaged } from "@/lib/manage";
import { HealthForm } from "./HealthForm";

export const dynamic = "force-dynamic";

export default async function FormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [b, form] = await Promise.all([getManaged(token), getForm(token)]);
  if (!b || !form?.enabled || !form.questions) redirect(`/m/${token}`);
  return <HealthForm token={token} business={b.business.name} questions={form.questions} />;
}
