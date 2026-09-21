/**
 * Post-format and campaign-objective options injected into the caption
 * prompt so tone/CTA pressure match how (and why) the post is actually
 * running - editable here, no other code changes needed.
 */

export type PostFormat = "grid" | "dark-post";

export interface PostFormatRule {
  id: PostFormat;
  label: string;
  description: string;
  styleGuidance: string;
}

export const POST_FORMAT_RULES: Record<PostFormat, PostFormatRule> = {
  grid: {
    id: "grid",
    label: "Grid post",
    description: "Organic - will appear on the client's public feed/grid.",
    styleGuidance:
      "This is an organic post that will appear permanently on the brand's own public grid/feed. It needs to read as an on-brand, native post - fit the account's usual voice and feel consistent with the rest of the grid, not like an ad.",
  },
  "dark-post": {
    id: "dark-post",
    label: "Dark post (ad)",
    description: "Paid - will NOT appear on the client's public grid, only shown to targeted ad audiences.",
    styleGuidance:
      "This is a dark/unpublished ad - it will never appear on the brand's public grid, only shown to a targeted paid audience. It's fine (and often better) to be more direct and performance-driven than an organic grid post - lead with the hook or offer without worrying about grid consistency.",
  },
};

export const ALL_POST_FORMATS = Object.keys(POST_FORMAT_RULES) as PostFormat[];

export type Objective = "traffic" | "awareness";

export interface ObjectiveRule {
  id: Objective;
  label: string;
  description: string;
  styleGuidance: string;
}

export const OBJECTIVE_RULES: Record<Objective, ObjectiveRule> = {
  traffic: {
    id: "traffic",
    label: "Traffic",
    description: "Goal is clicks/visits, not just reach.",
    styleGuidance:
      "Optimize for immediate action: a clear, direct call-to-action to click the link, visit, or shop now. Minimize friction and get to the ask quickly rather than lingering on story/brand-building.",
  },
  awareness: {
    id: "awareness",
    label: "Awareness",
    description: "Goal is reach and brand recall, not an immediate click.",
    styleGuidance:
      "Optimize for memorability and brand affinity over hard selling. No aggressive CTA - focus on the story, the feeling, or the value being shown rather than pushing a click.",
  },
};

export const ALL_OBJECTIVES = Object.keys(OBJECTIVE_RULES) as Objective[];
