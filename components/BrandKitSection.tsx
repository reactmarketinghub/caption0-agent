"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadBrandKitFile } from "@/lib/client/uploadBrandKitFile";
import type { BrandKitFile } from "@/lib/schemas";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BrandKitSectionProps {
  clientId: string;
  initialFiles: BrandKitFile[];
}

export function BrandKitSection({ clientId, initialFiles }: BrandKitSectionProps) {
  const [files, setFiles] = useState<BrandKitFile[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(fileList: FileList) {
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const blob = await uploadBrandKitFile(clientId, file);
        const res = await fetch(`/api/clients/${clientId}/brand-kit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            url: blob.url,
            size: file.size,
            contentType: file.type || "application/octet-stream",
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not save that file.");
        setFiles(json.brandKitFiles);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fileId: string) {
    setDeletingId(fileId);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-kit/${fileId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not remove that file.");
      setFiles(json.brandKitFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that file.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Brand kit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Logos, guideline docs, fonts, or anything else worth keeping on hand for this client.
          Stored for the team - not sent to Claude.
        </p>

        {files.length > 0 && (
          <ul className="divide-y rounded-md border">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" render={<a href={f.url} target="_blank" rel="noopener noreferrer" download={f.name} />}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600"
                    disabled={deletingId === f.id}
                    onClick={() => handleDelete(f.id)}
                  >
                    {deletingId === f.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Upload file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void handleUpload(e.target.files);
            e.target.value = "";
          }}
        />

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}
