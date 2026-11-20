import type { NextConfig } from "next";

const supabaseHost = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host; } catch { return ""; }
})();

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Page images are shrunk in the browser first (to about 300KB); this leaves room for a large one.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  images: supabaseHost ? { remotePatterns: [{ protocol: "https", hostname: supabaseHost }] } : undefined,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
