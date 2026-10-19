import { NextResponse } from "next/server";
import { z } from "zod";
import { refineRequestSchema, captionVariantSchema, type RefineRequest } from "@/lib/schemas";
import { TONE_IDS, TONE_OPTIONS } from "@/config/refinements";
import { generateStructured, imagesWithVideoLabels, GenerationTimeoutError } from "@/lib/claudeGenerate";
import { buildSystemPrompt } from "@/lib/prompts";
import {
  validateCaptionLength,
  validateBannedWords,
  validateNoExclamation,
  allowsExclamation,
  combineViolations,
} from "@/lib/generationValidation";
import { getBrandProfile, checkAndConsumeRateLimit, logGeneration } from "@/lib/kv";
import { getCurrentUserEmail } from "@/lib/auth";
import { isApiKeyProblem, API_KEY_PROBLEM_MESSAGE } from "@/lib/anthropic";

export const maxDuration = 60;

const refineResponseSchema = z.object({ variant: captionVariantSchema });

const INSTRUCTION_TEXT: Record<RefineRequest["instruction"], string> = {
  regenerate: "Write a fresh alternative caption for this same platform and creative - a different angle, not a minor tweak.",
  shorter: "Rewrite this caption to be noticeably shorter while keeping the same core message and CTA.",
  ...Object.fromEntries(TONE_IDS.map((id) => [id, TONE_OPTIONS[id].instruction])),
} as Record<RefineRequest["instruction"], string>;

// A single-caption rewrite doesn't need every frame of a long video - send an
// evenly spaced subset (first and last included) so Regenerate/Shorter/Tone
// stay quick. Static/carousel creatives pass through untouched.
const MAX_REFINE_FRAMES = 12;

function thinFramesForRefine(
  images: string[],
  creativeType: "static" | "carousel" | "video",
  timestamps?: number[],
): [string[], "static" | "carousel" | "video", number[] | undefined] {
  if (creativeType !== "video" || images.length <= MAX_REFINE_FRAMES) return [images, creativeType, timestamps];
  const keep = Array.from({ length: MAX_REFINE_FRAMES }, (_, i) =>
    Math.round((i * (images.length - 1)) / (MAX_REFINE_FRAMES - 1)),
  );
  return [
    keep.map((i) => images[i]),
    creativeType,
    timestamps && timestamps.length === images.length ? keep.map((i) => timestamps[i]) : timestamps,
  ];
}

export async function POST(req: Request) {
  let userEmail: string;
  try {
    userEmail = await getCurrentUserEmail();
  } catch {
    return NextResponse.json({ error: "Please sign in to generate captions." }, { status: 401 });
  }

  const rateLimit = await checkAndConsumeRateLimit(userEmail);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `You've hit the generation limit (${rateLimit.limit}/hour). Please wait a bit and try again.` },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsedRequest = refineRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "That request looked malformed. Please refresh and try again." },
      { status: 400 },
    );
  }
  const {
    clientId,
    postFormat,
    objective,
    platform,
    creativeType,
    images,
    videoLooksVoHeavy,
    videoFrameTimestamps,
    currentCaption,
    instruction,
  } = parsedRequest.data;

  const profile = clientId ? await getBrandProfile(clientId) : null;
  const system = buildSystemPrompt({
    profile,
    postFormat,
    objective,
    platforms: [platform],
    creativeType,
    videoLooksVoHeavy,
  });
  const userText = `The current caption for this platform is:\n"""\n${currentCaption}\n"""\n${INSTRUCTION_TEXT[instruction]}\n\nReturn ONLY strict JSON of the shape { "variant": { "caption": string, "char_count": number } }, no markdown fences.`;

  try {
    const { data, usage } = await generateStructured({
      system,
      userText,
      images: imagesWithVideoLabels(...thinFramesForRefine(images, creativeType, videoFrameTimestamps)),
      schema: refineResponseSchema,
      validate: (d) =>
        combineViolations(
          validateCaptionLength(platform, postFormat, d.variant),
          validateBannedWords(profile?.bannedWords ?? [], d.variant),
          allowsExclamation(profile) ? null : validateNoExclamation(d.variant),
        ),
    });

    await logGeneration({
      timestamp: new Date().toISOString(),
      userEmail,
      clientId,
      clientName: profile?.clientName,
      platforms: [platform],
      creativeType,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("Refine failed:", err);
    if (isApiKeyProblem(err)) {
      return NextResponse.json({ error: API_KEY_PROBLEM_MESSAGE }, { status: 503 });
    }
    if (err instanceof GenerationTimeoutError) {
      return NextResponse.json(
        { error: "That took too long. Please try again." },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: "We couldn't update that caption this time. Please try again in a moment." },
      { status: 502 },
    );
  }
}
