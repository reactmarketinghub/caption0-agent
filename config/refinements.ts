/**
 * The "Tone" options on a caption's refine menu - each one asks Claude to
 * rewrite that single caption in a particular direction. Edit freely: reword an
 * instruction, change a label, or add an option by adding its id to
 * TONE_IDS and an entry below (nothing else needs to change).
 */
export const TONE_IDS = ["playful", "energetic", "chatty", "funnier", "bolder"] as const;
export type ToneId = (typeof TONE_IDS)[number];

export interface ToneOption {
  label: string;
  /** The instruction sent to Claude along with the current caption. */
  instruction: string;
}

export const TONE_OPTIONS: Record<ToneId, ToneOption> = {
  playful: {
    label: "More playful",
    instruction:
      "Rewrite this caption to feel lighter and more playful - a little wit or fun in the wording - keeping the same core message, facts and CTA.",
  },
  energetic: {
    label: "More energetic",
    instruction:
      "Rewrite this caption with more energy and momentum - quicker sentences, active verbs, a sense of excitement - without shouting or stacking exclamation marks. Keep the same core message and CTA.",
  },
  chatty: {
    label: "More chatty",
    instruction:
      "Rewrite this caption as if you were talking to a friend - casual, conversational, with contractions and a bit of personality. Keep the same core message and CTA.",
  },
  funnier: {
    label: "Funnier",
    instruction:
      "Rewrite this caption with a light joke or witty observation that fits what's shown in the creative. Keep it good-natured and on-brand, and keep the same core message and CTA.",
  },
  bolder: {
    label: "Bolder",
    instruction:
      "Rewrite this caption to be more confident and direct - a stronger hook and a clearer point of view - without turning into hard-sell ad copy or hype. Keep the same core message and CTA.",
  },
};
