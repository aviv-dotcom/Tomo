import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";

/** The email link lands here with a one-time code, which becomes a session cookie. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const sb = await serverSupabase();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      // Back to an invitation if the sign-in started there; only our own join pages are accepted.
      const next = decodeURIComponent(request.cookies.get("tomo_next")?.value ?? "");
      const res = NextResponse.redirect(new URL(/^\/join\/[0-9a-f-]{36}$/i.test(next) ? next : "/", url.origin));
      res.cookies.delete("tomo_next");
      return res;
    }
  }
  return NextResponse.redirect(new URL("/login?error=callback", url.origin));
}
