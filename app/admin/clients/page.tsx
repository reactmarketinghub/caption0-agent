import Link from "next/link";
import { listBrandProfiles } from "@/lib/kv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { kvConfigured } from "@/lib/kv";

export default async function ClientsListPage() {
  const clients = await listBrandProfiles();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Brand <span className="font-serif font-normal italic">profiles</span>
        </h1>
        <Button nativeButton={false} render={<Link href="/admin/clients/new" />}>
          New client
        </Button>
      </div>

      {!kvConfigured() && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Vercel KV isn&apos;t configured yet, so brand profiles can&apos;t be saved. Add
          KV_REST_API_URL / KV_REST_API_TOKEN to your environment (see .env.example).
        </p>
      )}

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {clients.map((c) => (
            <li key={c.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{c.clientName}</p>
                <p className="line-clamp-1 text-sm text-muted-foreground">{c.toneOfVoice}</p>
              </div>
              <div className="flex items-center gap-2">
                {c.isDraft && <Badge variant="secondary">Draft</Badge>}
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/admin/clients/${c.id}`} />}
                >
                  Edit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
