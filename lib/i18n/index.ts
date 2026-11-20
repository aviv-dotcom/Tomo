import { en, he, type MessageKey } from "./messages";

export type Locale = "he" | "en";
const dictionaries: Record<Locale, Record<MessageKey, string>> = { he, en };

export const isRtl = (locale: Locale) => locale === "he";

/** Returns a translator for one locale. Missing keys fall back to Hebrew. */
export function translator(locale: Locale) {
  const dict = dictionaries[locale] ?? he;
  return (key: MessageKey) => dict[key] ?? he[key];
}
