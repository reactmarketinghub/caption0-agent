import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getBrandProfile, saveBrandProfile } from "@/lib/kv";

interface RouteParams {
  params: Promise<{ id: string; fileId: string }>;
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id, fileId } = await params;
  const profile = await getBrandProfile(id);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const file = profile.brandKitFiles.find((f) => f.id === fileId);
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(file.url);
    } catch (err) {
      console.warn("Blob delete failed (continuing to remove from profile):", err);
    }
  }

  const updated = {
    ...profile,
    brandKitFiles: profile.brandKitFiles.filter((f) => f.id !== fileId),
    updatedAt: new Date().toISOString(),
  };

  try {
    await saveBrandProfile(updated);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not remove this file." },
      { status: 500 },
    );
  }
}
