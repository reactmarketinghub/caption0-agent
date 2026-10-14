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
  postFormat: PostFormat | undefined,
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

/**
 * Checked as a `generateStructured` `validate` callback alongside
 * `validateCaptionLength` - a brand's banned words/phrases are meant to be a
 * hard, zero-exceptions rule, but the prompt alone can only ask nicely.
 * Unlike the free-form `donts` list (behavioral guidance no string check can
 * verify), `bannedWords` is a literal word/phrase list, so it's actually
 * mechanically checkable - this closes that gap the same way
 * `validateCaptionLength` already guarantees the character limit, via a
 * case-insensitive substring match and the same retry-with-a-corrective-
 * instruction pattern.
 */
export function validateBannedWords(bannedWords: string[], variant: CaptionVariant): string | null {
  if (!bannedWords.length) return null;
  const lowerCaption = variant.caption.toLowerCase();
  const hits = bannedWords.filter((w) => w.trim() && lowerCaption.includes(w.trim().toLowerCase()));
  if (!hits.length) return null;
  return `The caption uses a banned word/phrase that must never appear (${hits.join(", ")}). Rewrite it without these anywhere in the text, keeping the same core message.`;
}

/** Merges multiple `validate` results (e.g. a length check and a banned-words check) into one retry instruction covering everything that's actually wrong. */
export function combineViolations(...messages: Array<string | null>): string | null {
  const present = messages.filter((m): m is string => Boolean(m));
  return present.length ? present.join(" ") : null;
}

export function validateGenerationResponse(
  data: GenerationResponse,
  postFormat: PostFormat | undefined,
  bannedWords: string[] = [],
): string | null {
  const violations = data.platforms.flatMap((p) =>
    p.variants.flatMap((v, i) => {
      const msgs = [validateCaptionLength(p.platform, postFormat, v), validateBannedWords(bannedWords, v)].filter(
        (m): m is string => Boolean(m),
      );
      return msgs.map((msg) => `Variant ${i + 1}: ${msg}`);
    }),
  );
  if (!violations.length) return null;
  return `Some captions violated hard requirements and must be rewritten (only these need changing, keep the rest as-is):\n${violations.join("\n")}`;
}
