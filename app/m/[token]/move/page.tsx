import { redirect } from "next/navigation";
import { getManaged } from "@/lib/manage";
import { localDate } from "@/lib/time";
import { MoveFlow } from "./MoveFlow";

export const dynamic = "force-dynamic";

export default async function MovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await getManaged(token);
  if (!b || !b.can_change) redirect(`/m/${token}`);
  return <MoveFlow token={token} name={b.offering.name} delivery={b.offering.delivery} timezone={b.business.timezone} today={localDate(b.business.timezone)} />;
}
