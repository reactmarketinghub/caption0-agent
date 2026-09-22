/**
 * Per-platform caption rules used to build prompts, render limits in the UI,
 * and validate/warn on generated output.
 *
 * IMPORTANT: platform character/hashtag conventions change. Before relying on
 * these in production, re-verify against each platform's current help docs
 * and update `lastVerified`.
 */

import type { PostFormat } from "./objectives";

export type PlatformId = "instagram" | "tiktok" | "facebook" | "linkedin";

/** Ad network grouping - Instagram and Facebook both run under Meta's ad limits. */
export type AdNetwork = "Meta" | "TikTok" | "LinkedIn";

export interface PlatformRules {
  id: PlatformId;
  label: string;
  /** Which ad network's dark-post limits apply to this platform. */
  network: AdNetwork;
  /** Hard character limit enforced by the platform. */
  maxChars: number;
  /**
   * Characters visible in-feed before a "more"/"see more" truncation, for an
   * organic (grid) post.
   * The hook/key message should land inside this window.
   */
  visibleChars: number;
  /**
   * Same idea as `visibleChars`, but for a dark post (ad) - the primary-text
   * truncation point in the ad unit, which is often tighter than the organic
   * feed. Falls back to `visibleChars` when a platform has no distinct,
   * verified ad-specific number.
   */
  darkPostVisibleChars?: number;
  /**
   * Extra style guidance layered on top of `styleGuidance` specifically for
   * a dark post (any objective) - e.g. Meta ads should read a touch more
   * developed/elaborated even within the tight character limit, while a
   * platform with no note here (TikTok) keeps its normal dark-post style
   * unchanged.
   */
  darkPostStyleNote?: string;
  /** Recommended max hashtags for this app's output (style guidance, not a platform hard cap unless noted). */
  maxHashtags: number;
  /** Short style guidance injected into the system prompt. */
  styleGuidance: string;
  /** ISO date this platform's limits were last checked against official docs / current sources. */
  lastVerified: string;
}

export const PLATFORM_RULES: Record<PlatformId, PlatformRules> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    network: "Meta",
    // 2,200 char hard cap; hashtags count toward this limit.
    maxChars: 2200,
    // ~125 chars show before "... more" in feed.
    visibleChars: 125,
    // Meta (Instagram/Facebook) ads: 125 chars of primary text visible before truncation.
    darkPostVisibleChars: 125,
    darkPostStyleNote:
      "Let this read as a slightly more developed, fuller sentence rather than a clipped one-liner - still concise and within the character limit, just not maximally terse. Always ground this in the client's established brand tone of voice (from their brand profile/brand book) precisely if one is provided; if not, keep this warmer, fuller feel while staying true to the creative.",
    maxHashtags: 5,
    styleGuidance:
      "Put the hook / key message in the first line so it survives feed truncation. Conversational, can use emoji sparingly. Hashtags at the end, max 5, specific and relevant (not generic spam tags).",
    lastVerified: "2026-09-21",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    network: "TikTok",
    // Native app caption limit; some accounts/APIs report up to 4,000, but 2,200
    // is the safe, broadly-applicable ceiling to avoid false "OK" on accounts capped lower.
    maxChars: 2200,
    // ~100 chars visible before truncation in the caption area.
    visibleChars: 100,
    // TikTok ads: 100 chars of primary text visible before truncation.
    darkPostVisibleChars: 100,
    maxHashtags: 5,
    styleGuidance:
      "Short, punchy, conversational, written like a comment not an ad. Front-load the hook. Use keyword-rich phrasing (TikTok search relies on caption text), max 5 hashtags mixing a niche tag with broader ones.",
    lastVerified: "2026-09-21",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    network: "Meta",
    // Technical cap is 63,206 chars, but posts truncate hard in-feed.
    maxChars: 63206,
    // ~477 chars visible on desktop, ~125 on mobile before "See more".
    visibleChars: 250,
    // Meta (Instagram/Facebook) ads: 125 chars of primary text visible before truncation.
    darkPostVisibleChars: 125,
    darkPostStyleNote:
      "Let this read as a slightly more developed, fuller sentence rather than a clipped one-liner - still concise and within the character limit, just not maximally terse. Always ground this in the client's established brand tone of voice (from their brand profile/brand book) precisely if one is provided; if not, keep this warmer, fuller feel while staying true to the creative.",
    maxHashtags: 2,
    styleGuidance:
      "Conversational, minimal or no hashtags (at most 1-2 if genuinely relevant). Fine to be a bit longer/storytelling, but keep the key point in the first sentence or two before the 'See more' fold.",
    lastVerified: "2026-09-21",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    network: "LinkedIn",
    maxChars: 3000,
    // ~210 chars visible on desktop, ~140 on mobile before "see more".
    visibleChars: 210,
    maxHashtags: 5,
    styleGuidance:
      "Professional but human tone, no salesy hype. Use line breaks between short paragraphs for readability. 3-5 relevant hashtags at the end, no hashtag stuffing.",
    lastVerified: "2026-09-17",
  },
};

export const ALL_PLATFORM_IDS = Object.keys(PLATFORM_RULES) as PlatformId[];

export const ALL_NETWORKS: AdNetwork[] = ["Meta", "TikTok", "LinkedIn"];

/**
 * Platform selection in the UI is grouped by ad network, not by individual
 * platform - Meta always means Instagram + Facebook together (one caption
 * per platform is still generated, tuned to each platform's own hashtag/
 * style rules, but you can't select one without the other).
 */
export const NETWORK_PLATFORMS: Record<AdNetwork, PlatformId[]> = ALL_PLATFORM_IDS.reduce(
  (acc, id) => {
    const network = PLATFORM_RULES[id].network;
    acc[network] = [...(acc[network] ?? []), id];
    return acc;
  },
  {} as Record<AdNetwork, PlatformId[]>,
);

/**
 * The character limit that actually applies right now: the platform's hard
 * technical cap for a grid (organic) post, or the tighter ad primary-text
 * limit for a dark post (falling back to the hard cap when a platform has
 * no distinct, verified ad number). When post format wasn't specified
 * (left as "Not sure" in the UI), this conservatively uses the grid/hard-cap
 * number, since we don't know which network's tighter ad limit would apply.
 */
export function getEffectiveCharLimit(rules: PlatformRules, postFormat: PostFormat | undefined): number {
  return postFormat === "dark-post" ? (rules.darkPostVisibleChars ?? rules.maxChars) : rules.maxChars;
}
