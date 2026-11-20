import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/** Liveness plus a database round trip through a public, read-only function. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Only whether a key is set, never the key itself.
  const ai = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!url || !key) return NextResponse.json({ ok: true, db: "not_configured", ai });
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).rpc("core_health");
  return NextResponse.json({ ok: !error, db: error ? "error" : data, ai }, { status: error ? 503 : 200 });
}
