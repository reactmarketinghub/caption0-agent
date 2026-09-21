import { NextResponse } from "next/server";
import { generateRequestSchema, generationResponseSchema } from "@/lib/schemas";
import { generateStructured } from "@/lib/claudeGenerate";
import { buildSystemPrompt } from "@/lib/prompts";
import { getBrandProfile, checkAndConsumeRateLimit, logGeneration } from "@/lib/kv";
import { getCurrentUserEmail } from "@/lib/auth";

// Vision + multi-platform generation (plus a possible retry) can take a
// while; without this, Vercel's default function timeout can kill the
// request before Claude responds.
export const maxDuration = 60;

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
      {
        error: `You've hit the generation limit (${rateLimit.limit}/hour). Please wait a bit and try again.`,
      },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsedRequest = generateRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "That request looked malformed. Please refresh and try again." },
      { status: 400 },
    );
  }
  const { clientId, postFormat, objective, awarenessStage, platforms, creativeType, images, videoLooksVoHeavy } =
    parsedRequest.data;

  const profile = clientId ? await getBrandProfile(clientId) : null;

  const system = buildSystemPrompt({
    profile,
    postFormat,
    objective,
    awarenessStage,
    platforms,
    creativeType,
    videoLooksVoHeavy,
  });
  const userText =
    creativeType === "video"
      ? "Here are the extracted video frames in chronological order. Generate the captions now."
      : creativeType === "carousel"
        ? "Here are the carousel images in story order. Generate the captions now."
        : "Here is the creative. Generate the captions now.";

  try {
    const { data, usage } = await generateStructured({
      system,
      userText,
      images: images.map((dataUrl) => ({ dataUrl })),
      schema: generationResponseSchema,
    });

    await logGeneration({
      timestamp: new Date().toISOString(),
      userEmail,
      clientId,
      clientName: profile?.clientName,
      platforms,
      creativeType,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("Generation failed:", err);
    return NextResponse.json(
      {
        error:
          "We couldn't generate captions this time. Please try again in a moment - if it keeps happening, let the dev team know.",
      },
      { status: 502 },
    );
  }
}
