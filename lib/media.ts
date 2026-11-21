/** Public address of an image in the page-media bucket. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/page-media/${path}`;
}

export const PAGE_SECTIONS = ["services", "team", "classes", "gallery", "about", "hours", "contact"] as const;
export type PageSection = (typeof PAGE_SECTIONS)[number];

/** Brand colours the owner can pick. Each works with white text on buttons. */
export const ACCENTS = ["#3346d3", "#0b7a75", "#d6336c", "#c2410c", "#15803d", "#7c3aed", "#1f2937", "#9a3412"] as const;
