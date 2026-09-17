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

  return <BrandProfileForm profile={profile} />;
}
