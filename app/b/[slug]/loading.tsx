import { translator } from "@/lib/i18n";

const t = translator("he");

/** Shown while a business screen loads on a slow connection. */
export default function Loading() {
  return (
    <main className="page" aria-busy="true" aria-label={t("loading")}>
      <div className="skeleton" style={{ height: 34, width: "55%" }} />
      <div className="skeleton" style={{ height: 88 }} />
      <div className="skeleton" style={{ height: 160 }} />
      <div className="skeleton" style={{ height: 120 }} />
    </main>
  );
}
