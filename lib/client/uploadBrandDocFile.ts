"use client";

import { upload } from "@vercel/blob/client";

/**
 * Uploads a brand-doc source file (deck/PDF/DOCX/screenshot) to Vercel Blob
 * so /api/brand-doc/parse can fetch it server-side instead of receiving it
 * directly in the ~4.5MB-capped function body.
 */
export async function uploadBrandDocFile(file: File) {
  return upload(`uploads/brand-doc/${Date.now()}-${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
  });
}
