import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

/**
 * Issues client-upload tokens for Vercel Blob so the browser can upload
 * original creatives directly (Vercel functions cap request bodies at ~4.5MB).
 * These originals are kept only for a short audit trail; a daily cron job
 * (see /api/cron/cleanup-blobs) deletes anything older than 24h.
 */
export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage is not configured on this environment." },
      { status: 501 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "video/mp4",
          "video/quicktime",
        ],
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error("Blob upload token error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Upload failed" },
      { status: 400 },
    );
  }
}
