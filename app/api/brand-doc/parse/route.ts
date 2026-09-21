import { NextResponse } from "next/server";
import { extractBrandProfileFromFiles, BrandDocExtractionError, type BrandDocFileRef } from "@/lib/brandDocExtraction";
import { getCurrentUserEmail } from "@/lib/auth";

export const maxDuration = 60;

const MAX_FILES = 20;

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

  try {
    const { data } = await extractBrandProfileFromFiles({ files, pastedText, userEmail, clientName });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof BrandDocExtractionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Brand doc parse failed unexpectedly:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
