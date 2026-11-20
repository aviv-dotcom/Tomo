import { translator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default function Home() {
  const t = translator("he");
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 20px", display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 36 }}>{t("app.name")}</h1>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{t("home.title")}</p>
      <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.6 }}>{t("home.subtitle")}</p>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 16, display: "grid", gap: 6 }}>
        <span style={{ color: "var(--good)", fontWeight: 600 }}>✓ {t("home.status")}</span>
        <span style={{ color: configured ? "var(--good)" : "var(--ink-2)" }}>{configured ? "✓ " + t("home.db.ok") : t("home.db.missing")}</span>
      </div>
    </main>
  );
}
