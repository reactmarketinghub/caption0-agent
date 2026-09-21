import { brandDocParseResultSchema, type BrandDocParseResult, type BrandProfile } from "./schemas";
import { generateStructured, type ImageInput } from "./claudeGenerate";
import { buildBrandDocParseSystemPrompt } from "./prompts";
import { extractTextFromFile } from "./extractDocText";
import { logBrandDocUpload } from "./kv";

const MAX_DOC_CHARS = 40000;

const IMAGE_MEDIA_TYPES: Record<string, ImageInput["mediaType"]> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

/**
 * Brand kit files can be any type (logos, fonts, random assets) - only
 * auto-run guideline extraction for actual document types, not every upload
 * (a font file or logo image run through text extraction would just send
 * Claude garbage/irrelevant content on every brand kit upload).
 */
const AUTO_EXTRACT_DOC_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export function isAutoExtractableDoc(contentType: string): boolean {
  return AUTO_EXTRACT_DOC_CONTENT_TYPES.has(contentType);
}

/** Fills in blank single-value fields and unions list fields - never clobbers what a human already wrote. */
export function mergeExtractedIntoProfile(
  existing: BrandProfile,
  extracted: BrandDocParseResult,
): BrandProfile {
  const dedupe = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));
  return {
    ...existing,
    toneOfVoice: existing.toneOfVoice || extracted.toneOfVoice,
    dos: dedupe(existing.dos, extracted.dos),
    donts: dedupe(existing.donts, extracted.donts),
    bannedWords: dedupe(existing.bannedWords, extracted.bannedWords),
    emojiRules: existing.emojiRules || extracted.emojiRules,
    hashtagRules: existing.hashtagRules || extracted.hashtagRules,
    ctaStyle: existing.ctaStyle || extracted.ctaStyle,
    exampleCaptions: dedupe(existing.exampleCaptions, extracted.exampleCaptions).slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
}

export interface BrandDocFileRef {
  url: string;
  name: string;
  contentType: string;
}

export interface FileOutcome {
  name: string;
  status: "success" | "error";
  error?: string;
}

export class BrandDocExtractionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isTrustedBlobUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".vercel-storage.com");
  } catch {
    return false;
  }
}

/**
 * Shared by /api/brand-doc/parse (manual "Import from files" during profile
 * creation/edit) and the brand-kit upload route (automatic guideline
 * extraction when a client's brand kit doc is uploaded) - fetches each Blob
 * URL server-side, extracts text or collects images, asks Claude for a
 * structured profile, and logs every file's outcome either way.
 */
export async function extractBrandProfileFromFiles({
  files,
  pastedText,
  userEmail,
  clientName,
}: {
  files: BrandDocFileRef[];
  pastedText?: string;
  userEmail: string;
  clientName?: string;
}): Promise<{ data: BrandDocParseResult; outcomes: FileOutcome[] }> {
  const trimmedPaste = pastedText?.trim() ?? "";

  if (!files.length && !trimmedPaste) {
    throw new BrandDocExtractionError("Upload a file or paste some text first.", 400);
  }
  if (files.some((f) => !isTrustedBlobUrl(f.url))) {
    throw new BrandDocExtractionError("Invalid file reference.", 400);
  }

  const textParts: string[] = [];
  const images: ImageInput[] = [];
  const outcomes: FileOutcome[] = [];

  if (trimmedPaste) textParts.push(trimmedPaste);

  // Each file is read independently - one unreadable file shouldn't sink the
  // rest of the batch, and each outcome is logged for the admin's activity feed.
  for (const f of files) {
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`Could not download ${f.name}`);
      const buffer = Buffer.from(await res.arrayBuffer());

      const imageMediaType = IMAGE_MEDIA_TYPES[f.contentType];
      if (imageMediaType) {
        images.push({
          dataUrl: `data:${f.contentType};base64,${buffer.toString("base64")}`,
          mediaType: imageMediaType,
        });
      } else {
        const text = await extractTextFromFile({ buffer, name: f.name, type: f.contentType });
        if (text.trim()) textParts.push(`--- ${f.name} ---\n${text}`);
      }
      outcomes.push({ name: f.name, status: "success" });
    } catch (err) {
      console.error(`Brand doc file fetch/extract failed for ${f.name}:`, err);
      outcomes.push({
        name: f.name,
        status: "error",
        error: err instanceof Error ? err.message : "Could not read this file.",
      });
    }
  }

  async function flushLogs(finalError?: string) {
    await Promise.all(
      outcomes.map((o) =>
        logBrandDocUpload({
          timestamp: new Date().toISOString(),
          userEmail,
          fileName: o.name,
          clientName,
          status: o.status === "success" && !finalError ? "success" : "error",
          error: o.status === "error" ? o.error : finalError,
        }),
      ),
    );
  }

  if (!textParts.length && !images.length) {
    await flushLogs();
    throw new BrandDocExtractionError("No readable text or images were found in those files.", 400);
  }

  const combinedText = textParts.join("\n\n").slice(0, MAX_DOC_CHARS);
  const userText = images.length
    ? `Brand voice material below. Some of it is images of slides or screenshots - read any visible text in them too.${
        combinedText ? `\n\nExtracted document text:\n"""\n${combinedText}\n"""` : ""
      }\n\nExtract the brand profile fields now.`
    : `Brand voice document contents:\n"""\n${combinedText}\n"""\n\nExtract the brand profile fields now.`;

  try {
    const { data } = await generateStructured({
      system: buildBrandDocParseSystemPrompt(),
      userText,
      images,
      schema: brandDocParseResultSchema,
    });
    await flushLogs();
    // generateStructured's `schema: z.ZodType<T>` param forces Input=Output in
    // its generic, so T infers with the schema's (optional-before-default)
    // input shape rather than brandDocParseResultSchema's actual parsed
    // output - the runtime value is a fully-defaulted BrandDocParseResult.
    return { data: data as BrandDocParseResult, outcomes };
  } catch (err) {
    console.error("Brand doc parse failed:", err);
    await flushLogs("Claude couldn't extract a profile from this.");
    throw new BrandDocExtractionError(
      "We couldn't turn that into a profile. Please try again or fill the fields in manually.",
      502,
    );
  }
}
