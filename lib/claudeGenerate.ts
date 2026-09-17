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
  schema: z.ZodType<T>;
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
}: GenerateStructuredArgs<T>): Promise<GenerateStructuredResult<T>> {
  const client = getAnthropicClient();
  const content: Anthropic.ContentBlockParam[] = [
    ...imagesToBlocks(images),
    { type: "text", text: userText },
  ];

  let lastError: unknown = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const systemPrompt = attempt === 0 ? system : system + buildRetrySystemSuffix();

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    });

    totalInputTokens += message.usage.input_tokens;
    totalOutputTokens += message.usage.output_tokens;

    try {
      const parsed = parseJsonLoose(extractText(message));
      const validated = schema.parse(parsed);
      return {
        data: validated,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
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
