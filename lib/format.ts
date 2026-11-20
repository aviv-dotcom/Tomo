/** Money is stored in agorot. Shown in shekels, without decimals when whole. */
export function shekels(agorot: number | null | undefined): string {
  if (agorot == null) return "";
  const v = agorot / 100;
  return "₪" + v.toLocaleString("he-IL", { maximumFractionDigits: Number.isInteger(v) ? 0 : 2 });
}

/** A URL-safe address from a business name; Hebrew names get a short random address the owner can change. */
export function suggestSlug(name: string): string {
  const latin = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (latin.length >= 3) return latin;
  return "biz-" + Math.random().toString(36).slice(2, 8);
}

/** wa.me wants the international number without + or leading zero. Optional prefilled text. */
export function whatsappLink(phone: string, text?: string): string {
  const d = phone.replace(/\D/g, "");
  const n = d.startsWith("0") ? "972" + d.slice(1) : d;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
