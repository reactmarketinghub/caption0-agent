import { notFound } from "next/navigation";
import { getBrandProfile } from "@/lib/kv";
import { BrandProfileForm } from "@/components/BrandProfileForm";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getBrandProfile(id);
  if (!profile) notFound();

  // Keyed by updatedAt so a brand-kit guideline merge (which calls
  // router.refresh()) forces this client component to remount with the
  // freshly-merged fields instead of holding onto its stale initial state.
  return <BrandProfileForm key={profile.updatedAt} profile={profile} />;
}
