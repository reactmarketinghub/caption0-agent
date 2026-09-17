"use client";

import { upload } from "@vercel/blob/client";

/**
 * Best-effort upload of the original creative file to Vercel Blob for a
 * short-lived audit trail (auto-deleted after 24h). Never blocks or fails
 * the caption generation flow - if Blob isn't configured (e.g. local dev
 * without a token), this just resolves to null.
 */
export async function uploadOriginalToBlob(file: File): Promise<string | null> {
  try {
    const blob = await upload(`uploads/${Date.now()}-${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
    });
    return blob.url;
  } catch (err) {
    console.warn("Blob upload skipped:", err);
    return null;
  }
}
