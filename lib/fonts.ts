import { Amatic_SC, Assistant, David_Libre, Frank_Ruhl_Libre, Fredoka, Heebo, Playpen_Sans_Hebrew, Rubik, Secular_One, Suez_One, Varela_Round } from "next/font/google";

// Lettering for business pages. preload: false, so a font is downloaded only on a page that uses it.
const rubik = Rubik({ subsets: ["latin", "hebrew"], variable: "--pf-rubik", display: "swap", preload: false });
const heebo = Heebo({ subsets: ["latin", "hebrew"], variable: "--pf-heebo", display: "swap", preload: false });
const assistant = Assistant({ subsets: ["latin", "hebrew"], variable: "--pf-assistant", display: "swap", preload: false });
const varela = Varela_Round({ subsets: ["latin", "hebrew"], weight: "400", variable: "--pf-varela", display: "swap", preload: false });
const fredoka = Fredoka({ subsets: ["latin", "hebrew"], variable: "--pf-fredoka", display: "swap", preload: false });
const playpen = Playpen_Sans_Hebrew({ subsets: ["latin", "hebrew"], variable: "--pf-playpen", display: "swap", preload: false });
const frank = Frank_Ruhl_Libre({ subsets: ["latin", "hebrew"], variable: "--pf-frank", display: "swap", preload: false });
const david = David_Libre({ subsets: ["latin", "hebrew"], weight: ["400", "500", "700"], variable: "--pf-david", display: "swap", preload: false });
const secular = Secular_One({ subsets: ["latin", "hebrew"], weight: "400", variable: "--pf-secular", display: "swap", preload: false });
const suez = Suez_One({ subsets: ["latin", "hebrew"], weight: "400", variable: "--pf-suez", display: "swap", preload: false });
const amatic = Amatic_SC({ subsets: ["latin", "hebrew"], weight: ["400", "700"], variable: "--pf-amatic", display: "swap", preload: false });

export type FontKey = "rubik" | "heebo" | "assistant" | "varela" | "fredoka" | "playpen" | "frank" | "david" | "secular" | "suez" | "amatic";

/** Every font, in the order shown to the owner. `display` fonts are for headings only. */
export const PAGE_FONTS: { key: FontKey; name: string; family: string; display?: boolean; headScale?: number }[] = [
  { key: "rubik", name: "Rubik", family: "var(--pf-rubik)" },
  { key: "heebo", name: "Heebo", family: "var(--pf-heebo)" },
  { key: "assistant", name: "Assistant", family: "var(--pf-assistant)" },
  { key: "varela", name: "Varela Round", family: "var(--pf-varela)" },
  { key: "fredoka", name: "Fredoka", family: "var(--pf-fredoka)" },
  { key: "playpen", name: "Playpen", family: "var(--pf-playpen)" },
  { key: "frank", name: "Frank Ruhl", family: "var(--pf-frank)" },
  { key: "david", name: "David Libre", family: "var(--pf-david)" },
  { key: "secular", name: "Secular One", family: "var(--pf-secular)", display: true },
  { key: "suez", name: "Suez One", family: "var(--pf-suez)", display: true },
  { key: "amatic", name: "Amatic", family: "var(--pf-amatic)", display: true, headScale: 1.4 },
];

/** The CSS variables for all page fonts; put on a wrapper so its children can use any of them. */
export const FONT_VARS = [rubik, heebo, assistant, varela, fredoka, playpen, frank, david, secular, suez, amatic].map((f) => f.variable).join(" ");
export const fontFamily = (key: string | null | undefined) => (PAGE_FONTS.find((f) => f.key === key) ?? PAGE_FONTS[0]).family;
export const TEXT_ZOOM: Record<string, number> = { s: 0.92, m: 1, l: 1.12 };

/** Style for a page wrapper: colour, fonts and text size. */
export function pageStyle(p: { accent?: string | null; font_heading?: string | null; font_body?: string | null; text_size?: string | null }): React.CSSProperties {
  return {
    ...(p.accent ? { "--accent": p.accent, "--accent-soft": `color-mix(in srgb, ${p.accent} 13%, var(--surface))` } : {}),
    "--pub-head": fontFamily(p.font_heading), "--pub-body": fontFamily(p.font_body), "--pub-zoom": String(TEXT_ZOOM[p.text_size ?? "m"] ?? 1),
    // Narrow fonts (handwritten) read small; their headings are set larger.
    "--pub-head-scale": String(PAGE_FONTS.find((f) => f.key === p.font_heading)?.headScale ?? 1),
  } as React.CSSProperties;
}
