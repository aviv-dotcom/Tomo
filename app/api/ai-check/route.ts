import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { claude, MODELS } from "@/lib/ai";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.WORKER_SECRET ?? "";
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return secret.length > 0 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

/** Admin-only smoke test: one tiny request to confirm the API key works. Costs a fraction of a cent. */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const res = await claude().messages.create({
      model: MODELS.fast,
      max_tokens: 256,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    return NextResponse.json({ ok: true, model: res.model, reply: text, stop_reason: res.stop_reason, usage: { in: res.usage.input_tokens, out: res.usage.output_tokens } });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ ok: false, error: "invalid_api_key" }, { status: 502 });
    if (e instanceof Anthropic.PermissionDeniedError) return NextResponse.json({ ok: false, error: "permission_denied" }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ ok: false, error: "rate_limited_or_no_credit" }, { status: 502 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ ok: false, error: "api_error", status: e.status, message: e.message.slice(0, 200) }, { status: 502 });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
