import { NextResponse } from "next/server";
import { generateRequestSchema, generationResponseSchema, type GenerationResponse } from "@/lib/schemas";
import { generateStructured, imagesWithVideoLabels, GenerationTimeoutError } from "@/lib/claudeGenerate";
import { buildSystemPrompt } from "@/lib/prompts";
import { validateGenerationResponse, allowsExclamation } from "@/lib/generationValidation";
import {
  getBrandProfile,
  checkAndConsumeRateLimit,
  logGeneration,
  getRecentAngles,
  logCaptionAngles,
} from "@/lib/kv";
import { getCurrentUserEmail } from "@/lib/auth";
import { isApiKeyProblem, API_KEY_PROBLEM_MESSAGE } from "@/lib/anthropic";

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
  const {
    clientId,
    postFormat,
    objective,
    platforms,
    creativeType,
    images,
    videoLooksVoHeavy,
    videoFrameTimestamps,
  } = parsedRequest.data;

  const profile = clientId ? await getBrandProfile(clientId) : null;
  const recentAngles = clientId ? await getRecentAngles(clientId) : [];

  const userText =
    creativeType === "video"
      ? "Here are the extracted video frames in chronological order. Generate the captions now."
      : creativeType === "carousel"
        ? "Here are the carousel images in story order. Generate the captions now."
        : "Here is the creative. Generate the captions now.";

  // A client profile already carries the brand facts, so only search the web
  // when there isn't one - each search adds several seconds, and this route has
  // to finish inside the function time limit.
  const webSearch = !profile;
  const labelledImages = imagesWithVideoLabels(images, creativeType, videoFrameTimestamps);

  try {
    // One request per platform, run in parallel. A single request that writes
    // every platform's captions one after another took as long as all of them
    // added together (the main cause of "taking too long"); in parallel the
    // whole thing takes about as long as the slowest single platform.
    const settled = await Promise.allSettled(
      platforms.map((platform) =>
        generateStructured({
          system: buildSystemPrompt({
            profile,
            postFormat,
            objective,
            platforms: [platform],
            creativeType,
            videoLooksVoHeavy,
            recentAngles,
            webSearchEnabled: webSearch,
          }),
          userText,
          images: labelledImages,
          schema: generationResponseSchema,
          validate: (d) =>
            validateGenerationResponse(d, postFormat, profile?.bannedWords, {
              exclamation: allowsExclamation(profile) ? "require" : "forbid",
            }),
          enableWebSearch: webSearch,
        }),
      ),
    );

    const failure = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) throw failure.reason;

    const results = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const data: GenerationResponse = {
      inferred_voice: results.map((r) => r.data.inferred_voice).find(Boolean),
      platforms: results.map((r, i) => {
        const entry = r.data.platforms.find((p) => p.platform === platforms[i]) ?? r.data.platforms[0];
        return { ...entry, platform: platforms[i] };
      }),
    };
    const usage = {
      inputTokens: results.reduce((n, r) => n + r.usage.inputTokens, 0),
      outputTokens: results.reduce((n, r) => n + r.usage.outputTokens, 0),
    };

    if (clientId) {
      const newAngles = data.platforms.flatMap((p) =>
        p.variants.map((v) => v.angle).filter((a): a is string => Boolean(a)),
      );
      await logCaptionAngles(clientId, newAngles);
    }

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
    if (isApiKeyProblem(err)) {
      return NextResponse.json({ error: API_KEY_PROBLEM_MESSAGE }, { status: 503 });
    }
    if (err instanceof GenerationTimeoutError) {
      return NextResponse.json(
        { error: "That took too long to generate. Please click Generate again - it usually works on a second try." },
        { status: 504 },
      );
    }
    return NextResponse.json(
      {
        error:
          "We couldn't generate captions this time. Please try again in a moment - if it keeps happening, let the dev team know.",
      },
      { status: 502 },
    );
  }
}
