import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

/**
 * Issues client-upload tokens for Vercel Blob so the browser can upload
 * files directly (Vercel functions cap request bodies at ~4.5MB).
 *
 * Upload contexts, distinguished by pathname prefix:
 * - "uploads/..."            original creatives - short audit trail only,
 *                             restricted to image/video, auto-deleted after
 *                             24h by the daily cron (see
 *                             /api/cron/cleanup-blobs, which only targets
 *                             this prefix).
 * - "uploads/brand-doc/..."  brand voice decks/docs/screenshots uploaded for
 *                             one-off extraction (see /api/brand-doc/parse) -
 *                             also under "uploads/" so the same 24h cron
 *                             cleans them up automatically.
 * - "brand-kits/..."         persistent client brand kit files (logos,
 *                             guideline docs, fonts, etc.) - any file type,
 *                             never auto-deleted.
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
      onBeforeGenerateToken: async (pathname) => {
        if (pathname.startsWith("brand-kits/")) {
          return {
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
          };
        }
        if (pathname.startsWith("uploads/brand-doc/")) {
          return {
            allowedContentTypes: [
              "application/pdf",
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "text/plain",
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/gif",
            ],
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
          };
        }
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "video/mp4",
            "video/quicktime",
          ],
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
        };
      },
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
