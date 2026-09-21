import { NextResponse } from "next/server";
import { listBrandProfiles } from "@/lib/kv";

/**
 * TEMPORARY diagnostic route - reports what listBrandProfiles() actually
 * returns right now, to debug why /admin/clients and the Generator's client
 * dropdown appeared to disagree. DELETE this route once that's resolved.
 */
export async function GET() {
  const profiles = await listBrandProfiles();
  return NextResponse.json({
    count: profiles.length,
    clients: profiles.map((p) => ({
      id: p.id,
      clientName: p.clientName,
      isDraft: p.isDraft,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    checkedAt: new Date().toISOString(),
  });
}
