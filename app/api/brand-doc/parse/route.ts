import { NextResponse } from "next/server";
import { brandDocParseResultSchema } from "@/lib/schemas";
import { generateStructured, type ImageInput } from "@/lib/claudeGenerate";
import { buildBrandDocParseSystemPrompt } from "@/lib/prompts";
import { extractTextFromFile } from "@/lib/extractDocText";

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

  if (!files.length && !pastedText.trim()) {
    return NextResponse.json({ error: "Upload a file or paste some text first." }, { status: 400 });
  }

  if (files.some((f) => !isTrustedBlobUrl(f.url))) {
    return NextResponse.json({ error: "Invalid file reference." }, { status: 400 });
  }

  const textParts: string[] = [];
  const images: ImageInput[] = [];

  if (pastedText.trim()) textParts.push(pastedText);

  try {
    for (const f of files) {
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
    }
  } catch (err) {
    console.error("Brand doc file fetch/extract failed:", err);
    return NextResponse.json(
      { error: "We couldn't read one of those files. Please try again." },
      { status: 400 },
    );
  }

  if (!textParts.length && !images.length) {
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
    return NextResponse.json(data);
  } catch (err) {
    console.error("Brand doc parse failed:", err);
    return NextResponse.json(
      { error: "We couldn't turn that into a profile. Please try again or fill the fields in manually." },
      { status: 502 },
    );
  }
}
