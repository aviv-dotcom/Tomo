import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const body = Rubik({ subsets: ["latin", "hebrew"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Tomo",
  description: "A management layer for small businesses: less admin, more sales.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#3346D3" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={body.variable}>
      <body>{children}</body>
    </html>
  );
}
