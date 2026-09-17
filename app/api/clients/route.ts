import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { brandProfileInputSchema, type BrandProfile } from "@/lib/schemas";
import { listBrandProfiles, saveBrandProfile } from "@/lib/kv";

export async function GET() {
  const profiles = await listBrandProfiles();
  return NextResponse.json(profiles);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = brandProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That profile looked malformed. Please check the fields and try again." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const profile: BrandProfile = {
    ...parsed.data,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await saveBrandProfile(profile);
    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save profile." },
      { status: 500 },
    );
  }
}
