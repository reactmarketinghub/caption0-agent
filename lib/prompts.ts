import { PLATFORM_RULES, type PlatformId } from "@/config/platforms";
import type { BrandProfile } from "./schemas";

const JSON_CONTRACT = `Return ONLY strict JSON matching this exact shape, no markdown fences, no commentary:
{
  "inferred_voice"?: string,   // include ONLY if no brand profile was given
  "platforms": [
    {
      "platform": "instagram" | "tiktok" | "facebook" | "linkedin",
      "variants": [
        { "caption": string, "hashtags": string[], "char_count": number }
      ]
    }
  ]
}
Rules for the JSON:
- Include exactly one entry in "platforms" for each requested platform, in the order requested.
- Each platform must have exactly 3 variants.
- "char_count" is the character count of "caption" (including any inline hashtags you put in the caption body, but hashtags listed separately in "hashtags" should NOT be double counted unless they also appear in the caption text).
- "hashtags" entries do not include the leading "#".
- Do not wrap the JSON in \`\`\`.`;

function platformBlock(ids: PlatformId[]): string {
  return ids
    .map((id) => {
      const r = PLATFORM_RULES[id];
      return `- ${r.label}: max ${r.maxChars} characters, ~${r.visibleChars} visible before truncation, up to ${r.maxHashtags} hashtags. ${r.styleGuidance}`;
    })
    .join("\n");
}

function brandVoiceBlock(profile?: BrandProfile | null): string {
  if (!profile) {
    return `No brand profile is available for this client. Infer an appropriate tone of voice from the creative itself (visual style, on-screen text, mood, subject matter) and the brief if provided. Return your inferred tone as a short 1-2 sentence "inferred_voice" string so a human can sanity-check it before posting.`;
  }

  const lines = [
    `Brand profile for ${profile.clientName}:`,
    `Tone of voice: ${profile.toneOfVoice}`,
  ];
  if (profile.dos.length) lines.push(`Do: ${profile.dos.join("; ")}`);
  if (profile.donts.length) lines.push(`Don't: ${profile.donts.join("; ")}`);
  if (profile.bannedWords.length)
    lines.push(`Never use these words/phrases: ${profile.bannedWords.join(", ")}`);
  if (profile.emojiRules) lines.push(`Emoji rules: ${profile.emojiRules}`);
  if (profile.hashtagRules) lines.push(`Hashtag rules: ${profile.hashtagRules}`);
  if (profile.ctaStyle) lines.push(`CTA style: ${profile.ctaStyle}`);
  if (profile.exampleCaptions.length) {
    lines.push(
      `Example past captions in this voice:\n${profile.exampleCaptions
        .map((c, i) => `${i + 1}. ${c}`)
        .join("\n")}`,
    );
  }
  lines.push(
    `Match this established voice precisely. Do NOT include "inferred_voice" in your response since a profile was provided.`,
  );
  return lines.join("\n");
}

export interface BuildSystemPromptArgs {
  profile?: BrandProfile | null;
  brief?: string;
  platforms: PlatformId[];
  creativeType: "static" | "carousel" | "video";
}

export function buildSystemPrompt({
  profile,
  brief,
  platforms,
  creativeType,
}: BuildSystemPromptArgs): string {
  const parts: string[] = [
    `You are a senior social media copywriter at a marketing agency, writing ready-to-post captions for a client's social channels.`,
    brandVoiceBlock(profile),
    `Platforms requested (per-platform rules):\n${platformBlock(platforms)}`,
  ];

  if (creativeType === "carousel") {
    parts.push(
      `The creative is a carousel. The images are provided in story order (slide 1 first) — treat that order as the intended narrative arc and write captions that work with that sequence.`,
    );
  }

  if (creativeType === "video") {
    parts.push(
      `The creative is a video. You are shown ${`several evenly-spaced extracted frames`}, including an early frame around the 0.5s mark (the "hook" moment). You CANNOT hear this video's audio. Base captions strictly on the visuals, any on-screen text/captions visible in the frames, and the brief provided below. Do NOT guess at, invent, or paraphrase spoken dialogue or voiceover content — if the brief doesn't cover it, keep the caption grounded in what is visually shown.`,
    );
  }

  parts.push(
    brief && brief.trim().length > 0
      ? `Brief from the social media manager (key message / CTA / offer / launch date): ${brief.trim()}`
      : `No brief was provided. Infer the key message from the creative alone; keep claims conservative and avoid inventing specific offers, prices, or dates that aren't visible in the creative.`,
  );

  parts.push(JSON_CONTRACT);

  return parts.join("\n\n");
}

const BRAND_DOC_JSON_CONTRACT = `Return ONLY strict JSON matching this exact shape, no markdown fences, no commentary:
{
  "toneOfVoice": string,
  "dos": string[],
  "donts": string[],
  "bannedWords": string[],
  "emojiRules": string,
  "hashtagRules": string,
  "ctaStyle": string,
  "exampleCaptions": string[]
}
- "exampleCaptions" should contain 3-10 example captions if the document includes any past captions/examples, otherwise an empty array.
- Leave a field as an empty string/array if the document doesn't cover it - do not invent details.`;

export function buildBrandDocParseSystemPrompt(): string {
  return [
    `You are helping a social media agency turn a client's brand voice guidelines document into a structured brand profile used to prompt an AI copywriter later.`,
    `Read the provided document text and extract only what it actually says - tone of voice, do's and don'ts, banned words/phrases, emoji rules, hashtag rules, CTA style, and any example captions included.`,
    BRAND_DOC_JSON_CONTRACT,
  ].join("\n\n");
}

export function buildRetrySystemSuffix(): string {
  return `\n\nYour previous response could not be parsed as valid JSON matching the required schema. Return ONLY the corrected strict JSON, nothing else.`;
}
