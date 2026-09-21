/**
 * Per-platform caption rules used to build prompts, render limits in the UI,
 * and validate/warn on generated output.
 *
 * IMPORTANT: platform character/hashtag conventions change. Before relying on
 * these in production, re-verify against each platform's current help docs
 * and update `lastVerified`.
 */

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
