import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serviceSupabase } from "@/lib/supabase/server";
import { handlers, type Job } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.WORKER_SECRET ?? "";
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return secret.length > 0 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

/** Called every minute by pg_cron. Claims due jobs, runs each, and reports the result back to the database. */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = serviceSupabase();
  const { data, error } = await db.rpc("claim_jobs", { p_limit: 20 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const jobs = (data ?? []) as Job[];
  let done = 0, failed = 0;
  for (const job of jobs) {
    const run = handlers[job.kind];
    try {
      if (!run) throw new Error(`no handler for ${job.kind}`);
      await run(job);
      await db.rpc("finish_job", { p_id: job.id, p_error: null });
      done++;
    } catch (e) {
      await db.rpc("finish_job", { p_id: job.id, p_error: e instanceof Error ? e.message : String(e) });
      failed++;
    }
  }
  return NextResponse.json({ claimed: jobs.length, done, failed });
}
