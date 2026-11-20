/** Builds iCalendar (.ics) files that Google Calendar, Apple Calendar and Outlook read. */
export type IcsEvent = { uid: string; start: string; end: string; title: string; description?: string; location?: string | null; url?: string; stamp?: string };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Lines longer than 75 bytes are folded, as the format requires (Hebrew letters are 2 bytes each). */
function fold(line: string): string {
  const out: string[] = []; let cur = ""; let bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function ics(events: IcsEvent[], opts: { name?: string; refreshHours?: number } = {}): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tomo//HE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (opts.name) lines.push(`X-WR-CALNAME:${esc(opts.name)}`, "X-WR-TIMEZONE:Asia/Jerusalem");
  if (opts.refreshHours) lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${opts.refreshHours}H`, `X-PUBLISHED-TTL:PT${opts.refreshHours}H`);
  const now = utc(new Date().toISOString());
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${e.stamp ? utc(e.stamp) : now}`, `DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`, `SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A Google Calendar "add event" link for one event. */
export function googleAddLink(e: { title: string; start: string; end: string; details?: string; location?: string | null }): string {
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${utc(e.start)}/${utc(e.end)}` });
  if (e.details) q.set("details", e.details);
  if (e.location) q.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${q}`;
}
