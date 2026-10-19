import { PLATFORM_RULES, type PlatformId } from "@/config/platforms";
import { POST_FORMAT_RULES, OBJECTIVE_RULES, type PostFormat, type Objective } from "@/config/objectives";
import type { BrandProfile } from "./schemas";
import { allowsExclamation } from "./generationValidation";

const HUMAN_VOICE_GUIDANCE = `Write like a real social media manager typed this between other tasks, not like an AI. Concretely:
- Skip stock AI phrasing: "elevate," "unlock," "unleash," "game-changer," "dive in," "in today's world," "look no further," "whether you're X or Y." If a phrase sounds like it belongs in every other brand's caption too, cut it.
- No forced rule-of-three lists and no "it's not just X, it's Y" construction unless a real example genuinely calls for it.
- Don't lean on em dashes as a tic. Punctuate the way a person actually types a caption.
- Vary sentence length and rhythm across the 3 variants - they shouldn't read like the same template with words swapped.
- Sound specific to this creative and this brand, not like generic ad copy that could run under any photo.
- Use contractions naturally (it's, you'll, we're) and let a sentence run a little loose or informal when that's how a real person would actually type it - a slightly imperfect, conversational line reads more human than a grammatically tidy one.
- Don't manufacture a neat closing thought, lesson, or call-back just to wrap things up - it's fine for a caption to simply end, the way people actually post, instead of resolving like an essay.`;

const AD_COPY_CLICHES = `Concrete patterns that make a caption sound like ad copy, not a person - avoid all of these:
- Rhetorical-question openers aimed at the reader ("Still think X?", "Ready to Y?", "Tired of Z?") - at most ONE variant per platform may open with a question, and only if it's a real, specific one.
- Stock lines like "just got an upgrade," "calling your name," "built to go beyond," "before it's gone," "don't miss out," "grab yours," "level up," "take it to the next level," "treat yourself," "the perfect X for Y."
- Opening every caption with the same fact (e.g. the sale/event name). The offer can show up once, late, or not at all in a variant - it shouldn't be the first words of all three.
- A tidy "setup. benefit. command." three-sentence shape. If two variants have the same sentence skeleton, rewrite one.
- Describing the product's category in generic terms ("a flosser built for your routine") instead of saying one specific thing a person would actually notice or say about it.`;

const VOICE_TEXTURE_GUIDANCE = `Make the three variants feel like three different people on a social team wrote them:
- Name something SPECIFIC you can actually see or read in the creative (a color, an on-screen line, a detail, the setting) in at least two of the three variants. Don't invent facts, claims, prices or discounts that aren't in the creative or the brand profile.
- Vary length on purpose: one variant should be very short (a line or two, even a fragment), one medium, one can run a bit longer. Short is not lazy - it's often the most human.
- The call-to-action (when the objective calls for one) must be worded differently in each variant, and does NOT have to be the last sentence or contain a command verb. "Link's in bio," "it's on Amazon right now," or just naming where to find it all count. One variant may skip the explicit CTA if the post still clearly points at the link.
- Use plain words a friend would use. Prefer a concrete noun over an abstract benefit, and a normal sentence over a slogan.
- Before returning, reread each caption as if scrolling past it: if it could run under a different brand's post, repeats a phrase or ending from another variant, or reads like a slogan, rewrite it.

Illustration of the difference (different product, don't reuse the wording):
  Ad-copy: "Still struggling with tangled headphones? Meet the earbuds that make your commute a breeze. Shop now!"
  Human: "Wore these on the 7:40 train all week and nobody's asked me to repeat myself once. They're on sale until Sunday."`;

const EXCLAMATION_GUIDANCE = `Punctuation mix: don't let every caption end on a full stop. For each platform, at least one of the 3 variants must use an exclamation mark - to end a line or to mark a genuinely upbeat moment - so the set doesn't read flat. One or two of the three is plenty: never "!!" or a string of them, and not on a caption whose tone is genuinely serious.`;

const NO_EXCLAMATION_GUIDANCE = `This client's brand rules rule out exclamation marks. Use none, in any caption - end lines with full stops or question marks (or nothing) and get the energy from word choice instead.`;

const CREATIVE_VARIETY_GUIDANCE = `Be genuinely creative - don't default to the same safe move every time:
- A brand profile's permitted claims, approved phrases, or keywords are optional raw material, not a formula. "We're allowed to say X" does NOT mean "therefore say X here." Across variants, and across this client's posts over time, most captions should NOT lean on any specific approved claim at all - what's actually shown in the creative is usually the better story.
- The 3 variants for a given platform must take genuinely different creative angles from each other, not the same idea reworded. Draw from distinct angle types - e.g. a direct product/claim-led angle, an emotional/lifestyle/story angle, a curiosity or question-led hook, a social-proof or community angle, a playful/observational angle, a behind-the-scenes or process angle - and use a claim-led angle in at most one variant, if any.
- Actually analyze this specific creative, the brand profile, and (when you used it) anything you found via search, before deciding each variant's angle - don't reach for the first available claim or keyword by reflex. A caption that could run unchanged under a different photo from this client didn't do its job.`;

const NO_HASHTAGS_GUIDANCE = `Do not include hashtags anywhere in any caption - no leading "#" tokens, no trailing hashtag block. Write every caption as plain, hashtag-free copy.`;

const BRAND_COMPLIANCE_GUIDANCE = `Compliance comes before cleverness: the brand profile's "Don't" list and banned words/phrases above are hard, non-negotiable constraints - follow every one of them 100% of the time, with zero exceptions, even when breaking one would make for a punchier line. A caption that violates one of these is unusable no matter how good it otherwise reads, so if a draft idea needs a don't or a banned word to work, drop that idea rather than bend the rule. That said, compliance is a floor, not a script: within those constraints you have full creative freedom in how you frame, structure, and word each caption - let what's actually shown in THIS specific creative drive the angle, not a generic template you'd reuse for any photo. Also actually use the real information you were given - the brand's tone of voice, its do's, its keywords, its example captions - to ground the caption in specifics, instead of writing something generic that merely happens to avoid the don'ts.`;

const JSON_CONTRACT = `Return ONLY strict JSON matching this exact shape, no markdown fences, no commentary:
{
  "inferred_voice"?: string,   // include ONLY if no brand profile was given
  "platforms": [
    {
      "platform": "instagram" | "tiktok" | "facebook" | "linkedin",
      "variants": [
        { "caption": string, "char_count": number, "angle": string }
      ]
    }
  ]
}
Rules for the JSON:
- Include exactly one entry in "platforms" for each requested platform, in the order requested.
- Each platform must have exactly 3 variants.
- "char_count" is the character count of "caption".
- "angle" is a short 3-8 word internal label naming this variant's creative angle (e.g. "founder story hook", "customer social-proof", "playful observational humor", "direct product claim") - never shown to the end user, used only to track variety over time.
- Do not wrap the JSON in \`\`\`.`;

function platformBlock(ids: PlatformId[], postFormat: PostFormat | undefined): string {
  return ids
    .map((id) => {
      const r = PLATFORM_RULES[id];
      if (postFormat === "dark-post" && r.darkPostVisibleChars) {
        const elaboration = r.darkPostStyleNote ? ` ${r.darkPostStyleNote}` : "";
        return `- ${r.label} (${r.network} ad): HARD LIMIT of ${r.darkPostVisibleChars} characters for the ENTIRE caption. This is a dark post - there is no "see more" expansion to fall back on, so the whole caption (not just a preview/hook) must fit inside this limit.${elaboration} ${r.styleGuidance}`;
      }
      return `- ${r.label}: max ${r.maxChars} characters, ~${r.visibleChars} visible before feed truncation. ${r.styleGuidance}`;
    })
    .join("\n");
}

function brandVoiceBlock(profile?: BrandProfile | null): string {
  if (!profile) {
    return `No brand profile is available for this client. Infer an appropriate tone of voice from the creative itself (visual style, on-screen text, mood, subject matter). Return your inferred tone as a short 1-2 sentence "inferred_voice" string so a human can sanity-check it before posting.`;
  }

  const lines = [
    `Brand profile for ${profile.clientName}:`,
    profile.toneOfVoice
      ? `Tone of voice: ${profile.toneOfVoice}`
      : `Tone of voice: not stated. Work out the voice from this client's do's, don'ts, keywords and example captions below (they are the real signal), and from the creative itself.`,
  ];
  if (profile.dos.length)
    lines.push(
      `Do (a menu of things that are ON-BRAND and permitted when relevant, not a checklist to work through every time): ${profile.dos.join("; ")}`,
    );
  if (profile.donts.length)
    lines.push(
      `Don't (hard constraints - follow every one of these with zero exceptions): ${profile.donts.join("; ")}`,
    );
  if (profile.bannedWords.length)
    lines.push(
      `Banned words/phrases - must NEVER appear anywhere in any caption, no exceptions, not even inside a negation ("not X") or a joke: ${profile.bannedWords.join(", ")}`,
    );
  if (profile.keywords.length)
    lines.push(
      `Brand/product keywords to weave in naturally where relevant (don't force all of them into every caption, and never at the expense of sounding natural): ${profile.keywords.join(", ")}`,
    );
  if (profile.emojiRules) lines.push(`Emoji rules: ${profile.emojiRules}`);
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
  /** Left unset ("Not sure" in the UI) - Claude infers it from the creative instead. */
  postFormat?: PostFormat;
  /** Left unset ("Not sure" in the UI) - Claude infers it from the creative instead. */
  objective?: Objective;
  platforms: PlatformId[];
  creativeType: "static" | "carousel" | "video";
  /** Cheap pixel-based heuristic flag (fast cuts or a static talking-head shot) - see lib/client/extractVideoFrames.ts. */
  videoLooksVoHeavy?: boolean;
  /**
   * This client's recent per-variant "angle" labels (lib/kv.ts's
   * `getRecentAngles()`) - told to Claude as angles to avoid repeating, so
   * variety holds across generations/sessions, not just within one
   * generation's 3 variants. Omitted entirely for Mode B (no client).
   */
  recentAngles?: string[];
  /** Whether this call has the web_search tool bound - only true for /api/generate, see lib/claudeGenerate.ts's `enableWebSearch`. */
  webSearchEnabled?: boolean;
}

const WEB_SEARCH_GUIDANCE = `You have a web_search tool available. Use it sparingly - at most a couple of searches - and only when it would genuinely sharpen a caption: confirming a current, specific fact about this client/brand or product that isn't already covered by the brand profile (e.g. a recent launch, a real claim, what their site/social actually says), or getting a quick read on what's current/relevant for this kind of post right now. Don't search for things you already know, and don't let searching pad or slow down the result. Whether or not you search, your FINAL reply must be only the JSON object from the contract below - no narration, commentary, or mention of having searched, before or after it.`;

export function buildSystemPrompt({
  profile,
  postFormat,
  objective,
  platforms,
  creativeType,
  videoLooksVoHeavy,
  recentAngles,
  webSearchEnabled,
}: BuildSystemPromptArgs): string {
  const parts: string[] = [
    `You are a senior social media copywriter at a marketing agency, writing ready-to-post captions for a client's social channels.`,
    brandVoiceBlock(profile),
    `Platforms requested (per-platform rules):\n${platformBlock(platforms, postFormat)}`,
    postFormat
      ? `Post format: ${POST_FORMAT_RULES[postFormat].label}. ${POST_FORMAT_RULES[postFormat].styleGuidance}`
      : `Post format wasn't specified - infer from the creative and any visible context whether this reads more like an organic grid post (native, on-brand feel, matches the account's usual voice) or a paid dark-post ad (no public grid to worry about, fine to be more direct/CTA-forward), and match tone accordingly.`,
    objective
      ? `Campaign objective: ${OBJECTIVE_RULES[objective].label}. ${OBJECTIVE_RULES[objective].styleGuidance}`
      : `Objective wasn't specified - infer from the creative whether this is more about driving clicks/traffic (lead with a direct call-to-action) or building awareness/recall (no hard sell, focus on story/feeling), and match tone accordingly.`,
  ];

  if (creativeType === "carousel") {
    parts.push(
      `The creative is a carousel. The images are provided in story order (slide 1 first) — treat that order as the intended narrative arc and write captions that work with that sequence.`,
    );
  }

  if (creativeType === "video") {
    parts.push(
      `The creative is a video. You are shown many extracted frames in chronological order (a few are sharper key frames at scene changes), each labeled with its approximate timestamp, including an early frame around the 0.5s mark (the "hook" moment). You CANNOT hear this video's audio. Base captions strictly on the visuals and any on-screen text/captions visible in the frames. Do NOT guess at, invent, or paraphrase spoken dialogue or voiceover content — keep the caption grounded in what is visually shown.`,
    );
    parts.push(
      `These frames are samples, not continuous footage. Use the timestamps: where frames are under a second or two apart you can follow what changes (a product reveal, text appearing, a scene change) and use that; where there are bigger gaps, real seconds passed with cuts or camera moves you can't see, so don't narrate a blow-by-blow or invent a transition, action, or causal link between frames that isn't independently visible. Form an overall impression from the full set (subject, setting, product, mood, on-screen text) and write the caption from that — specific and confident about what's actually shown, silent about what isn't.`,
    );
    if (videoLooksVoHeavy) {
      parts.push(
        `A heuristic flagged this video as likely voiceover/dialogue-heavy (either fast cuts or a static locked-off shot like a talking head) - spoken content here is probably important but completely invisible to you, so lean even more heavily on any on-screen text/captions and the product/brand context visible in frames, and keep the caption conservative rather than guessing at what's being said.`,
      );
    }
  }

  parts.push(
    `No written brief is provided for this post - infer the key message, CTA, and any offer/launch context entirely from the creative itself (visual style, on-screen text, product shown) plus the brand profile, post format, and objective above. Keep claims conservative and avoid inventing specific prices, dates, or promo details that aren't visible in the creative.`,
  );

  parts.push(HUMAN_VOICE_GUIDANCE);
  parts.push(AD_COPY_CLICHES);
  parts.push(VOICE_TEXTURE_GUIDANCE);
  parts.push(allowsExclamation(profile) ? EXCLAMATION_GUIDANCE : NO_EXCLAMATION_GUIDANCE);
  parts.push(CREATIVE_VARIETY_GUIDANCE);
  if (profile) {
    parts.push(BRAND_COMPLIANCE_GUIDANCE);
  }
  parts.push(NO_HASHTAGS_GUIDANCE);

  if (recentAngles && recentAngles.length) {
    parts.push(
      `Angles already used in this client's recent posts - do NOT repeat any of these, pick genuinely different angles this time:\n${recentAngles
        .slice(0, 15)
        .map((a) => `- ${a}`)
        .join("\n")}`,
    );
  }

  if (webSearchEnabled) {
    parts.push(WEB_SEARCH_GUIDANCE);
  }

  parts.push(JSON_CONTRACT);

  return parts.join("\n\n");
}

const BRAND_DOC_JSON_CONTRACT = `Return ONLY strict JSON matching this exact shape, no markdown fences, no commentary:
{
  "toneOfVoice": string,
  "dos": string[],
  "donts": string[],
  "bannedWords": string[],
  "keywords": string[],
  "emojiRules": string,
  "ctaStyle": string,
  "exampleCaptions": string[]
}
- "keywords" is brand/product keywords or phrases (product names, taglines, search-relevant terms) the document calls out as worth using in captions - not a restatement of tone or do's/don'ts.
- "exampleCaptions" should contain 3-10 example captions if the document includes any past captions/examples, otherwise an empty array.
- Leave a field as an empty string/array if the document doesn't cover it - do not invent details.`;

export function buildBrandDocParseSystemPrompt(): string {
  return [
    `You are helping a social media agency turn a client's brand voice guidelines document into a structured brand profile used to prompt an AI copywriter later.`,
    `Read the provided document text and extract only what it actually says - tone of voice, do's and don'ts, banned words/phrases, brand/product keywords, emoji rules, CTA style, and any example captions included.`,
    BRAND_DOC_JSON_CONTRACT,
  ].join("\n\n");
}

export function buildRetrySystemSuffix(reason?: string): string {
  const why = reason ?? "Your previous response could not be parsed as valid JSON matching the required schema.";
  return `\n\n${why} Return ONLY the corrected strict JSON, nothing else.`;
}
