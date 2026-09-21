"use client";

import { upload } from "@vercel/blob/client";

/**
 * The @vercel/blob client swallows the real response body on a failed
 * token request and throws a generic "Failed to retrieve the client token"
 * error, so on failure we re-issue the same token request ourselves to
 * surface whatever /api/upload actually said (missing BLOB_READ_WRITE_TOKEN,
 * a disallowed content type, an auth redirect, etc.).
 */
async function diagnoseUploadFailure(pathname: string): Promise<string | null> {
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: { pathname, clientPayload: null, multipart: false },
      }),
    });
    if (res.ok) return null;
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { error?: string };
      return json.error ?? text.slice(0, 300);
    } catch {
      return text.slice(0, 300) || `HTTP ${res.status}`;
    }
  } catch {
    return null;
  }
}

/**
 * Uploads a brand-doc source file (deck/PDF/DOCX/screenshot) to Vercel Blob
 * so /api/brand-doc/parse can fetch it server-side instead of receiving it
 * directly in the ~4.5MB-capped function body.
 */
export async function uploadBrandDocFile(file: File) {
  const pathname = `uploads/brand-doc/${Date.now()}-${file.name}`;
  try {
    return await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
    });
  } catch (err) {
    const detail = await diagnoseUploadFailure(pathname);
    throw new Error(detail ?? (err instanceof Error ? err.message : "Upload failed"));
  }
}
