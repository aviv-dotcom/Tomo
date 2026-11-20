"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { Icon } from "@/components/Icon";

const t = translator("he");
const KNOWN = ["hours", "site", "forms", "business"] as const;

/** A short "saved" note after an edit screen closes itself. Reads ?saved= once, then removes it from the address. */
export function SavedToast({ slug }: { slug: string }) {
  const params = useSearchParams();
  const path = usePathname();
  const [note, setNote] = useState<{ what: (typeof KNOWN)[number]; n: string | null } | null>(null);

  useEffect(() => {
    const what = KNOWN.find((k) => k === params.get("saved"));
    if (!what) return;
    setNote({ what, n: params.get("n") });
    // Drop the note from the address without reloading the page.
    const rest = new URLSearchParams(params); rest.delete("saved"); rest.delete("n");
    window.history.replaceState(null, "", rest.size ? `${path}?${rest}` : path);
  }, [params, path]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  if (!note) return null;
  const detail = note.what === "hours" && note.n !== null ? (note.n === "0" ? t("hours.allclosed") : t("hours.summary").replace("{n}", note.n)) : null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon n="check" size={18} />
      <span className="grow"><b>{t(`saved.${note.what}` as MessageKey)}</b>{detail && <span className="small">{detail}</span>}</span>
      {note.what === "site" && <Link href={`/p/${slug}`} target="_blank" className="toast-link">{t("site.open")}</Link>}
      <button type="button" className="toast-x" aria-label={t("toast.close")} onClick={() => setNote(null)}><Icon n="x" size={16} /></button>
    </div>
  );
}
