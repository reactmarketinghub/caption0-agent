import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { listBrandProfiles, listBrandDocLogs } from "@/lib/kv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { kvConfigured } from "@/lib/kv";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function ClientsListPage() {
  const [clients, uploadLogs] = await Promise.all([listBrandProfiles(), listBrandDocLogs(20)]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 pt-12 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Brand <span className="font-serif font-normal italic text-accent-gold-text">profiles</span>
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

      {uploadLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent uploads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {uploadLogs.map((log, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {log.status === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                  )}
                  <span className="truncate">{log.fileName}</span>
                  {log.clientName && (
                    <span className="shrink-0 text-muted-foreground">- {log.clientName}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {log.status === "error" ? (log.error ?? "Failed") : timeAgo(log.timestamp)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
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
