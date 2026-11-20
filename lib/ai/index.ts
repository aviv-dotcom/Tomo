import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The only place the app talks to Claude. Model choice lives here so it can change in one line.
 * Never send names, phone numbers, health data, client notes or photos (see CLAUDE.md).
 */
export const MODELS = {
  /** Short understanding tasks: WhatsApp booking intent, classification, short wording. */
  fast: "claude-haiku-5-5",
  /** Longer reasoning: onboarding conversation, plans, owner assistant. */
  smart: "claude-sonnet-5-5",
} as const;

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!client) client = new Anthropic();
  return client;
}
