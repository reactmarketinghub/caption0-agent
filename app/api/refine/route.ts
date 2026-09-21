import { NextResponse } from "next/server";
import { z } from "zod";
import { refineRequestSchema, captionVariantSchema } from "@/lib/schemas";
import { generateStructured } from "@/lib/claudeGenerate";
import { buildSystemPrompt } from "@/lib/prompts";
import { validateCaptionLength } from "@/lib/generationValidation";
import { getBrandProfile, checkAndConsumeRateLimit, logGeneration } from "@/lib/kv";
import { getCurrentUserEmail } from "@/lib/auth";

export const maxDuration = 60;

const refineResponseSchema = z.object({ variant: captionVariantSchema });

const INSTRUCTION_TEXT: Record<string, string> = {
  regenerate: "Write a fresh alternative caption for this same platform and creative - a different angle, not a minor tweak.",
  shorter: "Rewrite this caption to be noticeably shorter and punchier while keeping the same core message and CTA.",
  punchier: "Rewrite this caption with a punchier hook and more energetic tone, keeping it accurate to the creative and the same core message.",
};

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
  const { clientId, postFormat, objective, platform, creativeType, images, currentCaption, instruction } =
    parsedRequest.data;

  const profile = clientId ? await getBrandProfile(clientId) : null;
  const system = buildSystemPrompt({
    profile,
    postFormat,
    objective,
    platforms: [platform],
    creativeType,
  });
  const userText = `The current caption for this platform is:\n"""\n${currentCaption}\n"""\n${INSTRUCTION_TEXT[instruction]}\n\nReturn ONLY strict JSON of the shape { "variant": { "caption": string, "hashtags": string[], "char_count": number } }, no markdown fences.`;

  try {
    const { data, usage } = await generateStructured({
      system,
      userText,
      images: images.map((dataUrl) => ({ dataUrl })),
      schema: refineResponseSchema,
      validate: (d) => validateCaptionLength(platform, postFormat, d.variant),
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
    return NextResponse.json(
      { error: "We couldn't update that caption this time. Please try again in a moment." },
      { status: 502 },
    );
  }
}
