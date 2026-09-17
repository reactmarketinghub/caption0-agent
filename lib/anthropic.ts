import Anthropic from "@anthropic-ai/sdk";

/**
 * Single source of truth for which Claude model the app calls.
 * Bump this one line to upgrade the whole app.
 */
export const CLAUDE_MODEL = "claude-sonnet-5";

export const MAX_OUTPUT_TOKENS = 4096;

let client: Anthropic | null = null;

/** Lazily-constructed singleton; throws a clear error if the server env var is missing. */
export function getAnthropicClient(): Anthropic {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment (see .env.example).",
    );
  }

  client = new Anthropic({ apiKey });
  return client;
}
