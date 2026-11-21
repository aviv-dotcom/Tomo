import { anonSupabase } from "@/lib/supabase/anon";
import { serviceSupabase } from "@/lib/supabase/server";

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/**
 * One photo of a shared visit card. The database decides (public_visit_photo, checked as an anonymous visitor) whether
 * this link may see this photo; only then is the private file read and streamed. The file never gets a public address,
 * and stopping the share cuts the link off immediately.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!isUuid(token) || !isUuid(id)) return new Response("Not found", { status: 404 });
  const { data: path } = await anonSupabase().rpc("public_visit_photo", { p_token: token, p_photo: id });
  if (!path) return new Response("Not found", { status: 404 });
  const { data: file } = await serviceSupabase().storage.from("client-media").download(path as string);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file, { headers: { "Content-Type": file.type || "image/jpeg", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
}
