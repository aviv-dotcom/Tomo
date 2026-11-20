/** The public address of the site, for links in messages. Set NEXT_PUBLIC_SITE_URL once there is a domain. */
export function siteBase(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
}
