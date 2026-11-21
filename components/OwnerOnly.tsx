import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { OwnerNav } from "@/components/OwnerNav";
import { Back, IconTile } from "@/components/Icon";

const t = translator("he");

/** What a manager sees on a screen only the owner can change. */
export function OwnerOnly({ slug, title }: { slug: string; title: MessageKey }) {
  return (
    <>
      <main className="page">
        <Back href={`/b/${slug}/settings`} label={t("set.title")} />
        <h1 className="h1">{t(title)}</h1>
        <section className="card" style={{ alignItems: "center", textAlign: "center", gap: 10, padding: 24 }}>
          <IconTile n="shield" size={48} tone="plain" />
          <b>{t("owner_only.title")}</b>
          <p className="muted small" style={{ margin: 0, maxWidth: "40ch" }}>{t("owner_only.body")}</p>
        </section>
      </main>
      <OwnerNav slug={slug} active="more" />
    </>
  );
}
