import { NextResponse } from "next/server";
import { brandDocParseResultSchema } from "@/lib/schemas";
import { generateStructured } from "@/lib/claudeGenerate";
import { buildBrandDocParseSystemPrompt } from "@/lib/prompts";
import { extractTextFromFile } from "@/lib/extractDocText";

const MAX_DOC_CHARS = 40000;

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let text = "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
      }
      text = await extractTextFromFile(file);
    } else {
      const body = await req.json().catch(() => null);
      text = typeof body?.text === "string" ? body.text : "";
    }
  } catch (err) {
    console.error("Doc text extraction failed:", err);
    return NextResponse.json(
      { error: "We couldn't read that file. Please try a PDF, DOCX, or plain text file." },
      { status: 400 },
    );
  }

  if (!text.trim()) {
    return NextResponse.json({ error: "Paste some text or upload a document first." }, { status: 400 });
  }

  const truncated = text.slice(0, MAX_DOC_CHARS);
  const userText = `Brand voice document contents:\n"""\n${truncated}\n"""\n\nExtract the brand profile fields now.`;

  try {
    const { data } = await generateStructured({
      system: buildBrandDocParseSystemPrompt(),
      userText,
      images: [],
      schema: brandDocParseResultSchema,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("Brand doc parse failed:", err);
    return NextResponse.json(
      { error: "We couldn't turn that document into a profile. Please try again or fill the fields in manually." },
      { status: 502 },
    );
  }
}
