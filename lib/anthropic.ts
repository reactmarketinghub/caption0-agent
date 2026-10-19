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

/**
 * A key pasted into Vercel's env var form often arrives with a trailing
 * newline/space, wrapping quotes, or the "ANTHROPIC_API_KEY=" prefix still
 * attached - all of which Anthropic rejects as "invalid x-api-key" even though
 * the key itself is fine. Strip those rather than fail.
 */
export function cleanApiKey(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^ANTHROPIC_API_KEY\s*=\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

/** Lazily-constructed singleton; throws a clear error if the server env var is missing. */
export function getAnthropicClient(): Anthropic {
  if (client) return client;

  const apiKey = cleanApiKey(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment (see .env.example).",
    );
  }

  client = new Anthropic({ apiKey });
  return client;
}

/** Shown when Anthropic rejects the server's key - nothing a user can fix from the page, so say who can. */
export const API_KEY_PROBLEM_MESSAGE =
  "The AI service rejected this app's API key, so nothing can be generated right now. An admin needs to put a valid key in the ANTHROPIC_API_KEY setting in Vercel (Settings > Environment Variables) and redeploy.";

/** True when the error means "the API key is missing or was rejected" (401/403 from Anthropic, or no key set). */
export function isApiKeyProblem(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return true;
  return err instanceof Error && err.message.startsWith("ANTHROPIC_API_KEY is not set");
}
