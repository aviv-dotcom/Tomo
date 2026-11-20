import { minToTime } from "@/lib/time";

/** A 24-hour time picker. Native time inputs follow the phone's locale and often show AM/PM. */
export function TimeSelect({ name, defaultValue, step = 15, from = 0, to = 24 * 60 - 1, label, className = "input input-ltr", onChange, value }: {
  name?: string; defaultValue?: string; step?: number; from?: number; to?: number; label: string; className?: string;
  value?: string; onChange?: (v: string) => void;
}) {
  const opts: string[] = [];
  for (let m = from; m <= to; m += step) opts.push(minToTime(m));
  const v = value ?? defaultValue;
  if (v && !opts.includes(v)) { opts.push(v); opts.sort(); }
  return (
    <select className={className} name={name} aria-label={label} {...(value !== undefined ? { value } : { defaultValue })}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
