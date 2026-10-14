import Anthropic from "@anthropic-ai/sdk";

/**
 * Single source of truth for which Claude model the app calls.
 * Bump this one line to upgrade the whole app.
 */
export const CLAUDE_MODEL = "claude-sonnet-5";

// Adaptive thinking counts toward max_tokens, so a tight cap can truncate the
// JSON mid-object (parse failure -> a whole second attempt -> timeout).
export const MAX_OUTPUT_TOKENS = 8192;

/**
 * How hard the model thinks before answering (low|medium|high|xhigh|max).
 * Sonnet 5's default is "high", which is slow for caption writing and was
 * pushing generations past Vercel's 60s function limit once web search and a
 * validation retry were added. "medium" keeps the deliberation that matters
 * for picking distinct angles at a fraction of the latency - raise it back if
 * caption quality ever looks thin and the function limit allows.
 */
export const GENERATION_EFFORT = "medium" as const;

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
