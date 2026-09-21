import { PLATFORM_RULES, getEffectiveCharLimit, type PlatformId } from "@/config/platforms";
import type { PostFormat } from "@/config/objectives";
import type { CaptionVariant, GenerationResponse } from "./schemas";

/**
 * Checked as a `generateStructured` `validate` callback - the character
 * limits vary per request (platform x post format), so they can't be baked
 * into the static zod schema. Returns a corrective instruction when a
 * variant is over its limit, or null when it's fine.
 */
export function validateCaptionLength(
  platform: PlatformId,
  postFormat: PostFormat,
  variant: CaptionVariant,
): string | null {
  const rules = PLATFORM_RULES[platform];
  const limit = getEffectiveCharLimit(rules, postFormat);
  if (variant.char_count <= limit) return null;

  const context =
    postFormat === "dark-post"
      ? rules.label === rules.network
        ? `${rules.network} dark-post ad primary text`
        : `${rules.label}'s ${rules.network} dark-post ad primary text`
      : rules.label;
  return `The ${rules.label} caption is ${variant.char_count} characters, over the ${limit}-character hard limit for ${context}. Rewrite it to fit fully within the limit - the WHOLE caption, not just an opening hook - while keeping the same core message.`;
}

export function validateGenerationResponse(data: GenerationResponse, postFormat: PostFormat): string | null {
  const violations = data.platforms.flatMap((p) =>
    p.variants
      .map((v, i) => {
        const msg = validateCaptionLength(p.platform, postFormat, v);
        return msg ? `Variant ${i + 1}: ${msg}` : null;
      })
      .filter((m): m is string => Boolean(m)),
  );
  if (!violations.length) return null;
  return `Some captions exceeded their character limit and must be rewritten shorter (only these need changing, keep the rest as-is):\n${violations.join("\n")}`;
}
