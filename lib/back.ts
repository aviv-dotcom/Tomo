import { translator } from "@/lib/i18n";

const t = translator("he");
export type BackKey = "today" | "appt" | "settings";

/** Where an edit screen returns to. Only fixed keys are accepted, never a free URL. */
export function backTarget(slug: string, back: string | undefined | null) {
  const key: BackKey = back === "today" || back === "appt" ? back : "settings";
  const href = key === "today" ? `/b/${slug}` : key === "appt" ? `/b/${slug}/calendar/new` : `/b/${slug}/settings`;
  const label = key === "today" ? t("nav.today") : key === "appt" ? t("appt.title") : t("set.title");
  return { key, href, label };
}

/** The address to go to after a successful save, carrying a short note for the toast. */
export function savedUrl(slug: string, back: string | undefined | null, what: string, extra: Record<string, string> = {}) {
  const { href } = backTarget(slug, back);
  return `${href}?${new URLSearchParams({ saved: what, ...extra })}`;
}
