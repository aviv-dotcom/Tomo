import type { Metadata } from "next";
import Link from "next/link";
import { serverSupabase } from "@/lib/supabase/server";
import { anonSupabase } from "@/lib/supabase/anon";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { IconTile } from "@/components/Icon";
import { JoinButton } from "./JoinButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
const t = translator("he");

/** An invitation to join a business's team. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = /^[0-9a-f-]{36}$/i.test(token);
  const { data } = ok ? await anonSupabase().rpc("invite_info", { p_token: token }) : { data: null };
  const info = data as { business: string; role: string; valid: boolean } | null;
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return (
    <main className="page" style={{ paddingTop: 48 }}>
      <IconTile n="users" size={56} />
      {!info || !info.valid ? (
        <><h1 className="h1">{t("join.invalid")}</h1><p className="sub">{t("join.invalid.body")}</p></>
      ) : (
        <>
          <h1 className="h1">{t("join.title").replace("{business}", info.business)}</h1>
          <p className="sub">{t("join.body").replace("{role}", t(`role.${info.role}` as MessageKey))}</p>
          {user ? (
            <>
              <p className="muted small" style={{ margin: 0 }}>{t("join.as").replace("{email}", user.email ?? "")}</p>
              <JoinButton token={token} />
            </>
          ) : (
            <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>{t("join.signin")}</Link>
          )}
        </>
      )}
    </main>
  );
}
