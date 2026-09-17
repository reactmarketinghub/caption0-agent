"use client";

import { upload } from "@vercel/blob/client";

/** Uploads a brand kit file (any type) to persistent Vercel Blob storage. */
export async function uploadBrandKitFile(clientId: string, file: File) {
  return upload(`brand-kits/${clientId}/${Date.now()}-${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
  });
}
