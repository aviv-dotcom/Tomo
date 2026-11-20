import "server-only";

export type Job = { id: number; kind: string; payload: Record<string, unknown>; attempts: number; business_id: string | null };
type Handler = (job: Job) => Promise<void>;

/** One handler per job kind. Handlers must be safe to run twice: the dedupe key stops most repeats, not all. */
export const handlers: Record<string, Handler> = {
  "system.ping": async () => {},
};
