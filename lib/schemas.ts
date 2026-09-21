import { z } from "zod";

export const platformIdSchema = z.enum(["instagram", "tiktok", "facebook", "linkedin"]);
export const postFormatSchema = z.enum(["grid", "dark-post"]);
export const objectiveSchema = z.enum(["traffic", "awareness"]);

/** One file in a client's brand kit (logo, guidelines doc, fonts, etc. - any type). */
export const brandKitFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  size: z.number().int().nonnegative(),
  contentType: z.string(),
  uploadedAt: z.string(),
});
export type BrandKitFile = z.infer<typeof brandKitFileSchema>;

/** A client's brand voice profile (Mode A). */
export const brandProfileSchema = z.object({
  id: z.string(),
  clientName: z.string().min(1),
  toneOfVoice: z.string().min(1),
  dos: z.array(z.string()).default([]),
  donts: z.array(z.string()).default([]),
  bannedWords: z.array(z.string()).default([]),
  emojiRules: z.string().default(""),
  hashtagRules: z.string().default(""),
  ctaStyle: z.string().default(""),
  exampleCaptions: z.array(z.string()).min(0).max(10).default([]),
  /** True when this profile was seeded from a Mode B "inferred voice" and not yet reviewed. */
  isDraft: z.boolean().default(false),
  /** Reference-only files (logos, guidelines, fonts) - not sent to Claude, managed via /api/clients/[id]/brand-kit. */
  brandKitFiles: z.array(brandKitFileSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BrandProfile = z.infer<typeof brandProfileSchema>;

/** Fields the admin form edits; server assigns id/timestamps. Brand kit files are managed separately. */
export const brandProfileInputSchema = brandProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  brandKitFiles: true,
});
export type BrandProfileInput = z.infer<typeof brandProfileInputSchema>;

/** What Claude extracts from an uploaded/pasted brand voice doc, for the admin to review before saving. */
export const brandDocParseResultSchema = brandProfileInputSchema.omit({
  clientName: true,
  isDraft: true,
});
export type BrandDocParseResult = z.infer<typeof brandDocParseResultSchema>;

/** One caption variant for a platform. */
export const captionVariantSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
  char_count: z.number().int().nonnegative(),
});
export type CaptionVariant = z.infer<typeof captionVariantSchema>;

/** Claude's output for a single platform. */
export const platformResultSchema = z.object({
  platform: platformIdSchema,
  variants: z.array(captionVariantSchema).min(1),
});
export type PlatformResult = z.infer<typeof platformResultSchema>;

/** Strict JSON contract Claude must return for a generation request. */
export const generationResponseSchema = z.object({
  inferred_voice: z.string().optional(),
  platforms: z.array(platformResultSchema).min(1),
});
export type GenerationResponse = z.infer<typeof generationResponseSchema>;

/** Request body for POST /api/generate. */
export const generateRequestSchema = z.object({
  clientId: z.string().optional(),
  postFormat: postFormatSchema,
  objective: objectiveSchema,
  platforms: z.array(platformIdSchema).min(1),
  creativeType: z.enum(["static", "carousel", "video"]),
  /** data URLs or Blob URLs for images (static: 1, carousel: many, video: extracted frames) */
  images: z.array(z.string()).min(1),
  /** Only meaningful for creativeType "video". */
  videoLooksVoHeavy: z.boolean().optional(),
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

/** Refine/regenerate a single variant. */
export const refineRequestSchema = z.object({
  clientId: z.string().optional(),
  postFormat: postFormatSchema,
  objective: objectiveSchema,
  platform: platformIdSchema,
  creativeType: z.enum(["static", "carousel", "video"]),
  images: z.array(z.string()).min(1),
  currentCaption: z.string(),
  instruction: z.enum(["regenerate", "shorter", "punchier"]),
});
export type RefineRequest = z.infer<typeof refineRequestSchema>;
