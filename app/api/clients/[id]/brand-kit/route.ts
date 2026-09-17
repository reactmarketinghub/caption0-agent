import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getBrandProfile, saveBrandProfile } from "@/lib/kv";

const addFileSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string().min(1),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Records an already-uploaded brand kit file (from /api/upload) against a client's profile. */
export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const profile = await getBrandProfile(id);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = addFileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "That upload looked malformed." }, { status: 400 });
  }

  const updated = {
    ...profile,
    brandKitFiles: [
      ...profile.brandKitFiles,
      { id: randomUUID(), uploadedAt: new Date().toISOString(), ...parsed.data },
    ],
    updatedAt: new Date().toISOString(),
  };

  try {
    await saveBrandProfile(updated);
    return NextResponse.json(updated, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save this file." },
      { status: 500 },
    );
  }
}
