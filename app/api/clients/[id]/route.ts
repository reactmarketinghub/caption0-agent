import { NextResponse } from "next/server";
import { brandProfileInputSchema, type BrandProfile } from "@/lib/schemas";
import { getBrandProfile, saveBrandProfile, deleteBrandProfile } from "@/lib/kv";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const profile = await getBrandProfile(id);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const existing = await getBrandProfile(id);
  if (!existing) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = brandProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That profile looked malformed. Please check the fields and try again." },
      { status: 400 },
    );
  }

  const updated: BrandProfile = {
    ...existing,
    ...parsed.data,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  try {
    await saveBrandProfile(updated);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save profile." },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  await deleteBrandProfile(id);
  return NextResponse.json({ ok: true });
}
