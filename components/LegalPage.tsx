import Link from "next/link";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { Back } from "@/components/Icon";

const t = translator("he");

/** A plain, readable legal page: title, sections of text, and where to go back. */
export function LegalPage({ title, back, intro, sections, footer, vars = {} }: {
  title: MessageKey; back: { href: string; label: string }; intro: MessageKey;
  sections: { title: MessageKey; body?: MessageKey; items?: MessageKey[]; extra?: React.ReactNode }[]; footer?: MessageKey; vars?: Record<string, string>;
}) {
  const fill = (k: MessageKey) => t(k).replace(/\{(\w+)\}/g, (_, v: string) => vars[v] ?? "");
  return (
    <main className="page legal" style={{ paddingBottom: 40 }}>
      <Back href={back.href} label={back.label} />
      <h1 className="h1">{t(title)}</h1>
      <p className="muted small" style={{ margin: 0 }}>{t("legal.updated")}</p>
      <p className="sub">{fill(intro)}</p>
      {sections.map((s) => (
        <section key={s.title} className="card">
          <h2 className="card-title">{t(s.title)}</h2>
          {s.body && <p style={{ margin: 0, lineHeight: 1.7 }}>{fill(s.body)}</p>}
          {s.items && <ul style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.8 }}>{s.items.map((i) => <li key={i}>{fill(i)}</li>)}</ul>}
          {s.extra}
        </section>
      ))}
      {footer && <p className="muted small">{fill(footer)}</p>}
      <p className="muted small"><Link href="/terms">{t("legal.terms")}</Link></p>
    </main>
  );
}
