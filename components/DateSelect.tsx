import { translator } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { addDays, dayNum, weekday } from "@/lib/time";

const t = translator("he");

/** A date picker as a plain list (day name and date), so it never shows the phone's US format. */
export function DateSelect({ name, from, days = 365, label, value, onChange, defaultValue }: {
  name?: string; from: string; days?: number; label: string; value?: string; defaultValue?: string; onChange?: (v: string) => void;
}) {
  const opts = Array.from({ length: days }, (_, i) => addDays(from, i));
  return (
    <select className="input" name={name} aria-label={label} {...(value !== undefined ? { value } : { defaultValue: defaultValue ?? from })}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}>
      {opts.map((d) => <option key={d} value={d}>{t(`day.${weekday(d)}` as MessageKey)} {dayNum(d)}.{Number(d.slice(5, 7))}{d.slice(0, 4) !== from.slice(0, 4) ? `.${d.slice(2, 4)}` : ""}</option>)}
    </select>
  );
}
