import type { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, CLAUDE_MODEL, MAX_OUTPUT_TOKENS, GENERATION_EFFORT } from "./anthropic";
import { buildRetrySystemSuffix } from "./prompts";
import { dataUrlToBase64 } from "./client/creativeAsset";

/**
 * Thrown when a generation runs out of its time budget. The routes turn this
 * into a clean JSON error instead of letting Vercel kill the function at its
 * hard limit, which answers with a plain-text page the UI can't parse.
 */
export class GenerationTimeoutError extends Error {
  constructor() {
    super("Generation ran out of time");
    this.name = "GenerationTimeoutError";
  }
}

// Total budget across all attempts. Routes set maxDuration = 60; this leaves
// headroom for the KV reads/writes and response around the model call.
const DEFAULT_TIME_BUDGET_MS = 50_000;
// A second attempt needs at least this long to be worth starting.
const MIN_RETRY_MS = 15_000;

export interface ImageInput {
  dataUrl: string;
  mediaType?: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  /** Short text sent immediately before this image (e.g. a video frame's timestamp), so Claude has per-image context instead of an undifferentiated image stack. */
  label?: string;
}

export interface GenerateStructuredArgs<T> {
  system: string;
  userText: string;
  images: ImageInput[];
  // Input loosened to `unknown` so T infers from the schema's actual parsed
  // (post-`.default()`) output shape, not the pre-default input shape that
  // `z.ZodType<T>`'s Input=Output default would otherwise force it to match.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /**
   * Optional business-rule check beyond schema validity (e.g. a hard
   * character limit that varies by request and can't be expressed in the
   * static zod schema). Return a description of what's wrong to trigger one
   * corrective retry, or null when the result is fine. If it still fails
   * validation after the retry, the result is returned anyway rather than
   * thrown - a caption that's merely over a soft limit is still useful, and
   * throwing would fail the whole generation over one imperfect variant.
   */
  validate?: (data: T) => string | null;
  /** Gives Claude the server-side web_search tool for this call - see `WEB_SEARCH_TOOL` below. */
  enableWebSearch?: boolean;
  /** Total time budget across all attempts; defaults to DEFAULT_TIME_BUDGET_MS. */
  timeBudgetMs?: number;
}

/**
 * Anthropic's server-side web search tool: the API itself performs the
 * search and folds the results back into the same response (no client-side
 * tool loop needed). `max_uses` caps it at a few searches per call to keep
 * latency and cost bounded - this is meant to sharpen a caption with a
 * quick, specific lookup, not to run a research project.
 */
const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 2,
};

export interface GenerateStructuredResult<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Labels each video frame with its approximate timestamp before sending it to
 * Claude, instead of an undifferentiated stack of images - without this,
 * nothing tells Claude how much real time (and potential scene change)
 * separates frames pulled from a single video, which invites it to narrate a
 * false continuous sequence of events across moments that may be seconds or
 * tens of seconds apart. No-ops for static/carousel creatives.
 */
export function imagesWithVideoLabels(
  dataUrls: string[],
  creativeType: "static" | "carousel" | "video",
  timestamps?: number[],
): ImageInput[] {
  if (creativeType !== "video" || !timestamps || timestamps.length !== dataUrls.length) {
    return dataUrls.map((dataUrl) => ({ dataUrl }));
  }
  return dataUrls.map((dataUrl, i) => ({
    dataUrl,
    label: `Frame ${i + 1} of ${dataUrls.length}, captured at ~${timestamps[i].toFixed(1)}s into the video.`,
  }));
}

function imagesToBlocks(images: ImageInput[]): Anthropic.ContentBlockParam[] {
  return images.flatMap((img) => {
    const blocks: Anthropic.ContentBlockParam[] = [];
    if (img.label) blocks.push({ type: "text", text: img.label });
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType ?? "image/jpeg",
        data: dataUrlToBase64(img.dataUrl),
      },
    });
    return blocks;
  });
}

/**
 * Only the LAST text block, not every text block joined - with web search
 * enabled, Claude's response can interleave several text blocks around its
 * search tool calls (e.g. a sentence noting it's about to look something up),
 * and joining all of them would corrupt the strict-JSON-only contract with
 * that narration. A plain (no-tool) response is still just one text block,
 * so this is a strict generalization, not a behavior change for that case.
 */
function extractText(message: Anthropic.Message): string {
  const textBlocks = message.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  return textBlocks.length ? textBlocks[textBlocks.length - 1].text : "";
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

/**
 * Calls Claude with images + instructions, expecting strict JSON matching `schema`.
 * Retries once (with a corrective instruction) if parsing/validation fails.
 */
export async function generateStructured<T>({
  system,
  userText,
  images,
  schema,
  validate,
  enableWebSearch,
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
}: GenerateStructuredArgs<T>): Promise<GenerateStructuredResult<T>> {
  const client = getAnthropicClient();
  const content: Anthropic.ContentBlockParam[] = [
    ...imagesToBlocks(images),
    { type: "text", text: userText },
  ];

  let lastError: unknown = null;
  let retrySuffixReason: string | undefined;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const startedAt = Date.now();
  const remainingMs = () => timeBudgetMs - (Date.now() - startedAt);

  const MAX_ATTEMPTS = 2;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // A retry that can't finish in time would just get killed mid-flight.
    if (attempt > 0 && remainingMs() < MIN_RETRY_MS) throw new GenerationTimeoutError();

    const systemPrompt = attempt === 0 ? system : system + buildRetrySystemSuffix(retrySuffixReason);

    let message: Anthropic.Message;
    const signal = AbortSignal.timeout(Math.max(remainingMs(), 1));
    try {
      message = await client.messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: systemPrompt,
          messages: [{ role: "user", content }],
          output_config: { effort: GENERATION_EFFORT },
          ...(enableWebSearch ? { tools: [WEB_SEARCH_TOOL] } : {}),
        },
        { signal },
      );
    } catch (err) {
      if (signal.aborted) throw new GenerationTimeoutError();
      throw err;
    }

    totalInputTokens += message.usage.input_tokens;
    totalOutputTokens += message.usage.output_tokens;
    const usage = { inputTokens: totalInputTokens, outputTokens: totalOutputTokens };

    // One line per attempt in the Vercel logs, so a slow or failing
    // generation can be diagnosed from facts instead of guessed at.
    console.log(
      JSON.stringify({
        evt: "generateStructured",
        attempt: attempt + 1,
        elapsedMs: Date.now() - startedAt,
        stopReason: message.stop_reason,
        outputTokens: message.usage.output_tokens,
        webSearches: message.usage.server_tool_use?.web_search_requests ?? 0,
      }),
    );

    try {
      const parsed = parseJsonLoose(extractText(message));
      const validated = schema.parse(parsed);

      const validationError = validate?.(validated) ?? null;
      const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
      // Retry only if there's time for it; otherwise fall through and return
      // the best-effort result, same as after a failed retry.
      if (validationError && !isLastAttempt && remainingMs() >= MIN_RETRY_MS) {
        lastError = new Error(validationError);
        retrySuffixReason = validationError;
        continue;
      }
      // Either it passed validation, or this was the last attempt - a
      // best-effort result beats throwing away an otherwise-usable caption.
      return { data: validated, usage };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Claude did not return valid JSON after retry: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
