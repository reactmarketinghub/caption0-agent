import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getBrandProfile, saveBrandProfile } from "@/lib/kv";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  extractBrandProfileFromFiles,
  mergeExtractedIntoProfile,
  isAutoExtractableDoc,
  BrandDocExtractionError,
} from "@/lib/brandDocExtraction";
import type { BrandProfile } from "@/lib/schemas";

export const maxDuration = 60;

const addFileSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string().min(1),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Records an already-uploaded brand kit file (from /api/upload) against a
 * client's profile. When it's a guideline/toolkit document (PDF/PPTX/DOCX/
 * TXT), also runs it through the same extraction pipeline as "Import from
 * files" and merges the result into the profile's structured fields, so
 * every future generation for this client refers to it via
 * brandVoiceBlock() - not just stored for reference.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const profile = await getBrandProfile(id);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = addFileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "That upload looked malformed." }, { status: 400 });
  }

  let updated: BrandProfile = {
    ...profile,
    brandKitFiles: [
      ...profile.brandKitFiles,
      { id: randomUUID(), uploadedAt: new Date().toISOString(), ...parsed.data },
    ],
    updatedAt: new Date().toISOString(),
  };

  let guidelinesMerged = false;
  if (isAutoExtractableDoc(parsed.data.contentType)) {
    let userEmail = "unknown";
    try {
      userEmail = await getCurrentUserEmail();
    } catch {
      // Best-effort for logging only - don't block the upload on this.
    }
    try {
      const { data } = await extractBrandProfileFromFiles({
        files: [{ url: parsed.data.url, name: parsed.data.name, contentType: parsed.data.contentType }],
        userEmail,
        clientName: profile.clientName,
      });
      updated = mergeExtractedIntoProfile(updated, data);
      guidelinesMerged = true;
    } catch (err) {
      // Non-fatal: the file still gets saved to the brand kit even if Claude
      // couldn't pull guidelines out of it.
      if (!(err instanceof BrandDocExtractionError)) {
        console.error("Brand kit guideline extraction failed unexpectedly:", err);
      }
    }
  }

  try {
    await saveBrandProfile(updated);
    return NextResponse.json({ ...updated, guidelinesMerged }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save this file." },
      { status: 500 },
    );
  }
}
