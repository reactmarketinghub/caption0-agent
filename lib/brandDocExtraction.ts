import { brandDocParseResultSchema, type BrandDocParseResult, type BrandProfile } from "./schemas";
import { generateStructured, GenerationTimeoutError, type ImageInput } from "./claudeGenerate";
import { buildBrandDocParseSystemPrompt } from "./prompts";
import { extractTextFromFile, renderPdfPagesAsImages, shrinkImageIfLarge } from "./extractDocText";
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
    keywords: dedupe(existing.keywords, extracted.keywords),
    emojiRules: existing.emojiRules || extracted.emojiRules,
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
  const startedAt = Date.now();
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

      let contributed = false;
      const imageMediaType = IMAGE_MEDIA_TYPES[f.contentType];
      if (imageMediaType) {
        images.push(await shrinkImageIfLarge(buffer, imageMediaType));
        contributed = true;
      } else {
        const text = await extractTextFromFile({ buffer, name: f.name, type: f.contentType });
        if (text.trim()) {
          textParts.push(`--- ${f.name} ---\n${text}`);
          contributed = true;
        } else if (f.contentType === "application/pdf") {
          // No text layer at all - likely a scanned or flattened/compressed
          // PDF where every page is really one embedded image. Fall back to
          // rendering pages as images so Claude's vision can still read it,
          // instead of failing the file outright.
          const pages = await renderPdfPagesAsImages(buffer);
          for (const page of pages) images.push(page);
          contributed = pages.length > 0;
        }
      }

      // A file that didn't throw but still produced nothing usable (empty
      // doc, a PDF the screenshot fallback couldn't render anything from)
      // is a real per-file failure, not a silent no-op - record it as one so
      // its reason shows up in the activity log and the batch-level error
      // below, instead of disappearing into a misleading "success".
      outcomes.push(
        contributed
          ? { name: f.name, status: "success" }
          : {
              name: f.name,
              status: "error",
              error:
                "No extractable text or images were found in this file - it may be empty or a format this tool can't read.",
            },
      );
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
    // Surface each file's actual failure reason instead of one generic
    // message - a specific pdf-parse/extraction error (or the reason above)
    // is far more actionable than "no readable text or images" alone, which
    // previously masked whatever really went wrong on a single-file upload.
    const reasons = outcomes
      .filter((o): o is FileOutcome & { error: string } => o.status === "error" && Boolean(o.error))
      .map((o) => `${o.name}: ${o.error}`);
    const detail = reasons.length ? ` ${reasons.join("; ")}` : "";
    throw new BrandDocExtractionError(`No readable text or images were found in those files.${detail}`, 400);
  }

  const combinedText = textParts.join("\n\n").slice(0, MAX_DOC_CHARS);
  const userText = images.length
    ? `Brand voice material below. Some of it is images of slides or screenshots - read any visible text in them too.${
        combinedText ? `\n\nExtracted document text:\n"""\n${combinedText}\n"""` : ""
      }\n\nExtract the brand profile fields now.`
    : `Brand voice document contents:\n"""\n${combinedText}\n"""\n\nExtract the brand profile fields now.`;

  try {
    // The route's hard limit is 60s and downloading/reading/rendering the
    // files already used some of it - give Claude whatever is left, so a slow
    // run fails with a clear message instead of being killed by Vercel.
    const { data } = await generateStructured({
      system: buildBrandDocParseSystemPrompt(),
      userText,
      images,
      schema: brandDocParseResultSchema,
      effort: "low",
      timeBudgetMs: Math.max(15_000, 52_000 - (Date.now() - startedAt)),
    });
    await flushLogs();
    return { data, outcomes };
  } catch (err) {
    console.error("Brand doc parse failed:", err);
    const reason = describeParseFailure(err, images.length);
    await flushLogs(reason);
    throw new BrandDocExtractionError(reason, err instanceof GenerationTimeoutError ? 504 : 502);
  }
}

/**
 * Plain-language reason for a failed Claude extraction step, so the upload log
 * says what actually happened. The form adds its own "paste the text instead"
 * hint, so these stay to the reason alone.
 */
function describeParseFailure(err: unknown, imageCount: number): string {
  if (err instanceof GenerationTimeoutError) {
    return `Reading these files took too long${
      imageCount > 3 ? " (the PDF is image-based, which is slower to read)" : ""
    }. Try fewer or smaller files at once.`;
  }
  const status = (err as { status?: number } | null)?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 413 || (status === 400 && /too large|exceed|size|dimension/i.test(message))) {
    return "Claude couldn't accept these files because they're too large. Try a smaller file or fewer files.";
  }
  if (status === 429 || status === 529 || status === 503) {
    return "Claude is busy right now. Please try again in a minute.";
  }
  // Last resort: still include the technical reason (trimmed) so a repeat
  // failure can be diagnosed from the screen or the Recent uploads log.
  return `We couldn't turn that into a profile. Technical detail: ${message.replace(/\s+/g, " ").slice(0, 280)}`;
}
