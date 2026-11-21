"use client";
import { translator } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
import { cancelSeries } from "../../actions";

const t = translator("he");

export function CancelSeries({ series, slug, date }: { series: string; slug: string; date: string }) {
  return (
    <form action={cancelSeries} onSubmit={(e) => { if (!confirm(t("series.cancel.confirm"))) e.preventDefault(); }}>
      <input type="hidden" name="series" value={series} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="date" value={date} />
      <button className="link-btn small" style={{ color: "var(--bad)", padding: 0 }}><Icon n="repeat" size={15} style={{ marginInlineEnd: 6 }} />{t("series.cancel")}</button>
    </form>
  );
}
