/** Date and time helpers. Everything is shown in the business time zone, whatever the device's zone is. */
export function localDate(tz: string, d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function weekday(date: string): number { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
export function dayNum(date: string): number { return Number(date.slice(8, 10)); }
export function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
export function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: tz, weekday: "short", day: "numeric", month: "numeric" }).format(new Date(iso));
}
export function minToTime(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
export function timeToMin(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }
export const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
