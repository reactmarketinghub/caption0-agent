import type { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, CLAUDE_MODEL, MAX_OUTPUT_TOKENS } from "./anthropic";
import { buildRetrySystemSuffix } from "./prompts";
import { dataUrlToBase64 } from "./client/creativeAsset";

export interface ImageInput {
  dataUrl: string;
  mediaType?: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
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
}

export interface GenerateStructuredResult<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number };
}

function imagesToBlocks(images: ImageInput[]): Anthropic.ImageBlockParam[] {
  return images.map((img) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: img.mediaType ?? "image/jpeg",
      data: dataUrlToBase64(img.dataUrl),
    },
  }));
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
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

  const MAX_ATTEMPTS = 2;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const systemPrompt = attempt === 0 ? system : system + buildRetrySystemSuffix(retrySuffixReason);

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    });

    totalInputTokens += message.usage.input_tokens;
    totalOutputTokens += message.usage.output_tokens;
    const usage = { inputTokens: totalInputTokens, outputTokens: totalOutputTokens };

    try {
      const parsed = parseJsonLoose(extractText(message));
      const validated = schema.parse(parsed);

      const validationError = validate?.(validated) ?? null;
      const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
      if (validationError && !isLastAttempt) {
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
