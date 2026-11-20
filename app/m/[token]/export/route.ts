import { NextResponse, type NextRequest } from "next/server";
import { anonSupabase } from "@/lib/supabase/anon";

/** The client's own data, as a JSON file, through their private booking link. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data, error } = await anonSupabase().rpc("public_export", { p_token: token });
  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="my-data.json"', "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
