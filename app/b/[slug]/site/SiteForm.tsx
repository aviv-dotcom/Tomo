"use client";
import { useActionState, useEffect, useState } from "react";
import { translator } from "@/lib/i18n";
import { saveSite, type SiteState } from "./actions";
import { Icon, Title } from "@/components/Icon";

const t = translator("he");
type Page = { published: boolean; tagline: string | null; about: string | null; whatsapp: string | null; address: string | null };

export function SiteForm({ business, slug, page }: { business: string; slug: string; page: Page }) {
  const [state, action, pending] = useActionState<SiteState, FormData>(saveSite, null);
  const [copied, setCopied] = useState(false);
  // The full address is known only in the browser; render the path first so server and browser agree.
  const [url, setUrl] = useState(`/p/${slug}`);
  useEffect(() => setUrl(`${window.location.origin}/p/${slug}`), [slug]);
  return (
    <>
      <section className="card">
        <Title n="link">{t("site.link")}</Title>
        <span className="input-ltr" style={{ textAlign: "start", wordBreak: "break-all" }}>{url}</span>
        <div className="row">
          <a className="btn btn-secondary btn-small" href={`/p/${slug}`} target="_blank" rel="noopener noreferrer"><Icon n="external" />{t("site.open")}</a>
          <button type="button" className="btn btn-secondary btn-small" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>
            <Icon n={copied ? "check" : "copy"} />{copied ? t("site.copied") : t("site.copy")}</button>
        </div>
      </section>
      <form action={action} className="card" style={{ gap: 12 }}>
        <Title n="edit">{t("site.content")}</Title>
        <input type="hidden" name="business" value={business} /><input type="hidden" name="slug" value={slug} />
        <label className="check" style={{ fontWeight: 600 }}><input type="checkbox" name="published" defaultChecked={page.published} /> {t("site.published")}</label>
        <label className="field"><span className="label">{t("site.tagline")}</span><input className="input" name="tagline" maxLength={120} defaultValue={page.tagline ?? ""} /></label>
        <label className="field"><span className="label">{t("site.about")}</span><textarea className="input" name="about" maxLength={1200} rows={5} style={{ padding: 12 }} defaultValue={page.about ?? ""} /></label>
        <label className="field"><span className="label">{t("site.whatsapp")}</span><input className="input input-ltr" name="whatsapp" type="tel" defaultValue={page.whatsapp ?? ""} /></label>
        <label className="field"><span className="label">{t("site.address")}</span><input className="input" name="address" maxLength={120} defaultValue={page.address ?? ""} /></label>
        <p className="muted small" style={{ margin: 0 }}>{t("site.hint")}</p>
        {state?.error && <p className="error" role="alert">{t(state.error)}</p>}
        {state?.ok && !pending && <p className="muted small" role="status"><Icon n="check" size={15} />{t("site.saved")}</p>}
        <button className="btn btn-primary" disabled={pending}><Icon n="check" />{pending ? t("site.saving") : t("site.save")}</button>
      </form>
    </>
  );
}
