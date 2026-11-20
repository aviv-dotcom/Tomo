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
