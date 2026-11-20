import type { MessageKey } from "@/lib/i18n/messages";

const known = ["invalid_name", "invalid_slug", "slug_taken", "too_many_businesses", "not_signed_in", "slot_taken", "outside_hours",
  "overlapping_hours", "already_booked", "session_closed", "not_owner", "not_allowed"] as const;

/** Maps a database error (raised as a short code) to a message key. Unknown errors get a generic message. */
export function errorKey(message: string | undefined): MessageKey {
  if (!message) return "err.generic";
  if (/people_(full_name|phone|email)_check/.test(message)) return "err.invalid_person";
  const hit = known.find((k) => message.includes(k));
  return hit ? (`err.${hit}` as MessageKey) : "err.generic";
}
