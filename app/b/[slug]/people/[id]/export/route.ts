import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";

/** Everything the business holds about one client, as a JSON file. Owners and managers only (checked in the database). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { id } = await params;
  const sb = await serverSupabase();
  const { data, error } = await sb.rpc("person_export", { p_person: id });
  if (error || !data) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="client-${id.slice(0, 8)}.json"`, "Cache-Control": "no-store" },
  });
}
