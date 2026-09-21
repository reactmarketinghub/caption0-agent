import { NextResponse } from "next/server";
import { brandDocParseResultSchema } from "@/lib/schemas";
import { generateStructured, type ImageInput } from "@/lib/claudeGenerate";
import { buildBrandDocParseSystemPrompt } from "@/lib/prompts";
import { extractTextFromFile } from "@/lib/extractDocText";
import { logBrandDocUpload } from "@/lib/kv";
import { getCurrentUserEmail } from "@/lib/auth";

export const maxDuration = 60;

const MAX_DOC_CHARS = 40000;
const MAX_FILES = 20;

const IMAGE_MEDIA_TYPES: Record<string, ImageInput["mediaType"]> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

interface BrandDocFileRef {
  url: string;
  name: string;
  contentType: string;
}

interface FileOutcome {
  name: string;
  status: "success" | "error";
  error?: string;
}

function isTrustedBlobUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".vercel-storage.com");
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const files: BrandDocFileRef[] = Array.isArray(body?.files) ? body.files.slice(0, MAX_FILES) : [];
  const pastedText: string = typeof body?.text === "string" ? body.text : "";
  const clientName: string | undefined =
    typeof body?.clientName === "string" && body.clientName.trim() ? body.clientName.trim() : undefined;

  let userEmail = "unknown";
  try {
    userEmail = await getCurrentUserEmail();
  } catch {
    // Best-effort for logging only - don't block extraction on this.
  }

  if (!files.length && !pastedText.trim()) {
    return NextResponse.json({ error: "Upload a file or paste some text first." }, { status: 400 });
  }

  if (files.some((f) => !isTrustedBlobUrl(f.url))) {
    return NextResponse.json({ error: "Invalid file reference." }, { status: 400 });
  }

  const textParts: string[] = [];
  const images: ImageInput[] = [];
  const outcomes: FileOutcome[] = [];

  if (pastedText.trim()) textParts.push(pastedText);

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
    return NextResponse.json(
      { error: "No readable text or images were found in those files." },
      { status: 400 },
    );
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
    return NextResponse.json(data);
  } catch (err) {
    console.error("Brand doc parse failed:", err);
    await flushLogs("Claude couldn't extract a profile from this.");
    return NextResponse.json(
      { error: "We couldn't turn that into a profile. Please try again or fill the fields in manually." },
      { status: 502 },
    );
  }
}
