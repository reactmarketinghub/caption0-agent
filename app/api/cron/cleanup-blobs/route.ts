import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes uploaded originals from Vercel Blob older than 24h. Triggered by
 * the Vercel Cron job in vercel.json (Vercel sends
 * `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is set).
 */
export async function GET(req: Request) {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ skipped: true, reason: "Blob not configured" });
  }

  const cutoff = Date.now() - MAX_AGE_MS;
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const { blobs, cursor: nextCursor, hasMore } = await list({ prefix: "uploads/", cursor });
    const stale = blobs.filter((b) => new Date(b.uploadedAt).getTime() < cutoff);
    if (stale.length > 0) {
      await del(stale.map((b) => b.url));
      deleted += stale.length;
    }
    cursor = hasMore ? nextCursor : undefined;
  } while (cursor);

  return NextResponse.json({ deleted });
}
