import { PLATFORM_RULES, getEffectiveCharLimit, type PlatformId } from "@/config/platforms";
import type { PostFormat } from "@/config/objectives";
import type { BrandProfile, CaptionVariant, GenerationResponse } from "./schemas";

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

/**
 * Whether the "at least one variant uses an exclamation mark" rule applies for
 * this client. A brand profile that says no exclamation marks (in its don'ts,
 * banned words or emoji/punctuation rules) wins - the brand's hard rules come
 * before the house style.
 */
export function allowsExclamation(profile?: BrandProfile | null): boolean {
  if (!profile) return true;
  if (profile.bannedWords.some((w) => w.includes("!"))) return false;
  const rules = [...profile.donts, profile.emojiRules, profile.ctaStyle];
  // Either spells it out ("exclamation marks/points", "!-marks") or pairs a "!"
  // with a negation ("no !", "never use '!'", "avoid !", "don't use !").
  const negation = /\b(no|not|never|avoid|don'?t|do not|without|zero|ban(ned)?|forbid(den)?|stop)\b/i;
  return !rules.some((r) => /exclamation|!\s*marks?/i.test(r) && negation.test(r) || (r.includes("!") && negation.test(r)));
}

/** For a client whose rules rule out "!": no caption may contain one (checked like a banned word). */
export function validateNoExclamation(variant: CaptionVariant): string | null {
  if (!variant.caption.includes("!")) return null;
  return `This client's brand rules rule out exclamation marks, but the caption uses one. Rewrite it with no "!" anywhere (end on a full stop, a question mark or no punctuation instead), keeping the same core message.`;
}

/**
 * At least one of a platform's variants should use a "!" - otherwise every
 * caption ends on a full stop and the set reads flat and samey. One is enough;
 * the rest can stay as they are.
 */
export function validateExclamationMix(data: GenerationResponse): string | null {
  const missing = data.platforms.filter((p) => !p.variants.some((v) => v.caption.includes("!")));
  if (!missing.length) return null;
  const names = missing.map((p) => PLATFORM_RULES[p.platform].label).join(", ");
  return `None of the ${names} variants uses an exclamation mark. Rewrite at least one of them so it uses a "!" naturally (to end a line or mark a genuinely upbeat moment - not shouty, never "!!"), still inside the character limit. The other variants can stay as they are.`;
}

export function validateGenerationResponse(
  data: GenerationResponse,
  postFormat: PostFormat | undefined,
  bannedWords: string[] = [],
  options: { exclamation?: "require" | "forbid" | "ignore" } = {},
): string | null {
  const violations = data.platforms.flatMap((p) =>
    p.variants.flatMap((v, i) => {
      const msgs = [
        validateCaptionLength(p.platform, postFormat, v),
        validateBannedWords(bannedWords, v),
        options.exclamation === "forbid" ? validateNoExclamation(v) : null,
      ].filter((m): m is string => Boolean(m));
      return msgs.map((msg) => `Variant ${i + 1}: ${msg}`);
    }),
  );
  const mix = options.exclamation === "require" ? validateExclamationMix(data) : null;
  if (!violations.length && !mix) return null;
  const parts: string[] = [];
  if (violations.length) {
    parts.push(
      `Some captions violated hard requirements and must be rewritten (only these need changing, keep the rest as-is):\n${violations.join("\n")}`,
    );
  }
  if (mix) parts.push(mix);
  return parts.join("\n");
}
