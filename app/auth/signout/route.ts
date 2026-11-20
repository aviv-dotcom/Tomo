import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const sb = await serverSupabase();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
