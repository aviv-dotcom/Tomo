import Link from "next/link";
import { redirect } from "next/navigation";
import { translator } from "@/lib/i18n";
import { serverSupabase } from "@/lib/supabase/server";
import { IconTile } from "@/components/Icon";

export const dynamic = "force-dynamic";
const HOME_ICONS = { "home.point1": "users", "home.point2": "bell", "home.point3": "inbox" } as const;

export default async function Home() {
  const t = translator("he");
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (configured) {
    const sb = await serverSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const { data } = await sb.rpc("my_businesses");
      const first = (data as { slug: string }[] | null)?.[0];
      redirect(first ? `/b/${first.slug}` : "/start");
    }
  }
  return (
    <main className="page" style={{ paddingTop: 56 }}>
      <h1 className="h1" style={{ fontSize: 34 }}>{t("app.name")}</h1>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{t("home.title")}</p>
      <p className="sub">{t("home.subtitle")}</p>
      <div className="card">
        {(["home.point1", "home.point2", "home.point3"] as const).map((k) => (
          <div key={k} className="step"><IconTile n={HOME_ICONS[k]} size={32} />{t(k)}</div>
        ))}
      </div>
      <Link className="btn btn-primary" href="/login">{t("home.cta")}</Link>
      <Link className="btn btn-secondary" href="/login">{t("home.login")}</Link>
      {!configured && <p className="muted">{t("home.db.missing")}</p>}
    </main>
  );
}
