"use client";
import { translator } from "@/lib/i18n";
import { googleAddLink, ics } from "@/lib/ics";
import { Icon } from "@/components/Icon";

const t = translator("he");
type Ev = { title: string; start: string; end: string; location?: string | null; details?: string };

/** "Add to calendar": a Google link, and an .ics file that iPhone, Outlook and others open. */
export function AddToCalendar({ ev, icsHref }: { ev: Ev; icsHref?: string }) {
  function download() {
    const blob = new Blob([ics([{ uid: `${ev.start}-${ev.title}@tomo`, start: ev.start, end: ev.end, title: ev.title, location: ev.location, description: ev.details }])], { type: "text/calendar" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "booking.ics"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  return (
    <div className="field">
      <span className="label row" style={{ gap: 6 }}><Icon n="calendarPlus" size={16} />{t("addcal.title")}</span>
      <div className="row btn-row">
        <a className="btn btn-secondary btn-small" href={googleAddLink({ ...ev })} target="_blank" rel="noopener noreferrer"><Icon n="calendar" />{t("addcal.google")}</a>
        {icsHref ? <a className="btn btn-secondary btn-small" href={icsHref}><Icon n="download" />{t("addcal.apple")}</a>
          : <button type="button" className="btn btn-secondary btn-small" onClick={download}><Icon n="download" />{t("addcal.apple")}</button>}
      </div>
    </div>
  );
}
