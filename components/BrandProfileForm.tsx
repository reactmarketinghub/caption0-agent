"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandKitSection } from "@/components/BrandKitSection";
import { uploadBrandDocFile } from "@/lib/client/uploadBrandDocFile";
import { cn } from "@/lib/utils";
import type { BrandDocParseResult, BrandProfile, BrandProfileInput } from "@/lib/schemas";

const ACCEPTED_EXTENSIONS = ".pptx,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif";
const ACCEPTED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
].join(",");

interface UploadLogEntry {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "parsing" | "done" | "error";
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function fromLines(values: string[]): string {
  return values.join("\n");
}

interface FormState {
  clientName: string;
  toneOfVoice: string;
  dos: string;
  donts: string;
  bannedWords: string;
  emojiRules: string;
  hashtagRules: string;
  ctaStyle: string;
  exampleCaptions: string;
}

function toFormState(profile?: BrandProfile | null): FormState {
  return {
    clientName: profile?.clientName ?? "",
    toneOfVoice: profile?.toneOfVoice ?? "",
    dos: fromLines(profile?.dos ?? []),
    donts: fromLines(profile?.donts ?? []),
    bannedWords: fromLines(profile?.bannedWords ?? []),
    emojiRules: profile?.emojiRules ?? "",
    hashtagRules: profile?.hashtagRules ?? "",
    ctaStyle: profile?.ctaStyle ?? "",
    exampleCaptions: fromLines(profile?.exampleCaptions ?? []),
  };
}

function toInput(state: FormState, isDraft: boolean): BrandProfileInput {
  return {
    clientName: state.clientName.trim(),
    toneOfVoice: state.toneOfVoice.trim(),
    dos: toLines(state.dos),
    donts: toLines(state.donts),
    bannedWords: toLines(state.bannedWords),
    emojiRules: state.emojiRules.trim(),
    hashtagRules: state.hashtagRules.trim(),
    ctaStyle: state.ctaStyle.trim(),
    exampleCaptions: toLines(state.exampleCaptions).slice(0, 10),
    isDraft,
  };
}

interface BrandProfileFormProps {
  profile?: BrandProfile;
}

export function BrandProfileForm({ profile }: BrandProfileFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(toFormState(profile));
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadLog, setUploadLog] = useState<UploadLogEntry[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(!!profile);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormState>(key: K, value: string) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function applyExtracted(result: BrandDocParseResult) {
    setState((s) => ({
      ...s,
      toneOfVoice: result.toneOfVoice || s.toneOfVoice,
      dos: result.dos.length ? fromLines(result.dos) : s.dos,
      donts: result.donts.length ? fromLines(result.donts) : s.donts,
      bannedWords: result.bannedWords.length ? fromLines(result.bannedWords) : s.bannedWords,
      emojiRules: result.emojiRules || s.emojiRules,
      hashtagRules: result.hashtagRules || s.hashtagRules,
      ctaStyle: result.ctaStyle || s.ctaStyle,
      exampleCaptions: result.exampleCaptions.length
        ? fromLines(result.exampleCaptions)
        : s.exampleCaptions,
    }));
    setDetailsOpen(true);
  }

  const handleFiles = useCallback(async (incoming: File[]) => {
    if (!incoming.length) return;
    setError(null);
    setExtracting(true);

    const ids = incoming.map(() => crypto.randomUUID());
    setUploadLog((log) => [
      ...incoming.map((f, i) => ({ id: ids[i], name: f.name, size: f.size, status: "uploading" as const })),
      ...log,
    ]);

    const uploaded = await Promise.all(
      incoming.map(async (file, i) => {
        try {
          const blob = await uploadBrandDocFile(file);
          setUploadLog((log) => log.map((e) => (e.id === ids[i] ? { ...e, status: "parsing" } : e)));
          return { url: blob.url, name: file.name, contentType: file.type || "application/octet-stream" };
        } catch (err) {
          setUploadLog((log) =>
            log.map((e) =>
              e.id === ids[i]
                ? { ...e, status: "error" as const, error: err instanceof Error ? err.message : "Upload failed" }
                : e,
            ),
          );
          return null;
        }
      }),
    );

    const successfulIds = ids.filter((_, i) => uploaded[i] !== null);
    const successfulFiles = uploaded.filter((u): u is NonNullable<typeof u> => u !== null);

    if (!successfulFiles.length) {
      setExtracting(false);
      return;
    }

    try {
      const res = await fetch("/api/brand-doc/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: successfulFiles }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read those files.");
      applyExtracted(json as BrandDocParseResult);
      setUploadLog((log) => log.map((e) => (successfulIds.includes(e.id) ? { ...e, status: "done" as const } : e)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read those files.";
      setError(message);
      setUploadLog((log) =>
        log.map((e) => (successfulIds.includes(e.id) ? { ...e, status: "error" as const, error: message } : e)),
      );
    } finally {
      setExtracting(false);
    }
  }, []);

  async function handleExtractFromPaste() {
    if (!pasteText.trim()) return;
    setExtracting(true);
    setError(null);
    const id = crypto.randomUUID();
    setUploadLog((log) => [{ id, name: "Pasted text", size: pasteText.length, status: "parsing" }, ...log]);
    try {
      const res = await fetch("/api/brand-doc/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not parse that text.");
      applyExtracted(json as BrandDocParseResult);
      setUploadLog((log) => log.map((e) => (e.id === id ? { ...e, status: "done" } : e)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not parse that text.";
      setError(message);
      setUploadLog((log) => log.map((e) => (e.id === id ? { ...e, status: "error", error: message } : e)));
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!state.clientName.trim() || !state.toneOfVoice.trim()) {
      setError("Client name and tone of voice are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = toInput(state, false);
      const res = await fetch(profile ? `/api/clients/${profile.id}` : "/api/clients", {
        method: profile ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save this profile.");
      router.push("/admin/clients");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!profile) return;
    if (!confirm(`Delete the brand profile for "${profile.clientName}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/clients/${profile.id}`, { method: "DELETE" });
      router.push("/admin/clients");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <div className="space-y-1">
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to clients
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {profile ? (
            <>
              Edit <span className="font-serif font-normal italic text-accent-gold-text">{profile.clientName}</span>
            </>
          ) : (
            <>
              New <span className="font-serif font-normal italic text-accent-gold-text">client</span>
            </>
          )}
        </h1>
      </div>

      {profile && <BrandKitSection clientId={profile.id} initialFiles={profile.brandKitFiles} />}

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Import from files</h2>
          <p className="text-sm text-muted-foreground">
            Drop any PDFs, decks, or screenshots for this client - Claude reads them and fills in a
            profile below for you to review before saving. Drop as many at once as you like.
          </p>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => !extracting && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!extracting) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const files = Array.from(e.dataTransfer.files ?? []);
            if (files.length && !extracting) void handleFiles(files);
          }}
          className={cn(
            "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-input",
            extracting && "pointer-events-none opacity-70",
          )}
        >
          {extracting ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Reading and extracting with Claude...</p>
            </>
          ) : (
            <>
              <UploadCloud className="h-7 w-7 text-muted-foreground" />
              <p className="font-medium">Drag & drop files, or click to browse</p>
              <p className="text-sm text-muted-foreground">PDF · PPTX · DOCX · TXT · screenshots</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={`${ACCEPTED_EXTENSIONS},${ACCEPTED_MIME_TYPES}`}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) void handleFiles(files);
              e.target.value = "";
            }}
          />
        </div>

        {uploadLog.length > 0 && (
          <ul className="space-y-1.5 rounded-lg border p-3 text-sm">
            {uploadLog.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  {entry.status === "uploading" || entry.status === "parsing" ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                  ) : entry.status === "done" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {entry.status === "uploading" && "Uploading..."}
                  {entry.status === "parsing" && "Extracting..."}
                  {entry.status === "done" && formatBytes(entry.size)}
                  {entry.status === "error" && (entry.error ?? "Failed")}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!showPaste ? (
          <button
            type="button"
            onClick={() => setShowPaste(true)}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            Or paste text instead
          </button>
        ) : (
          <div className="space-y-2 rounded-lg border p-3">
            <Textarea
              placeholder="Paste brand voice guidelines text here"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={4}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={extracting || !pasteText.trim()}
              onClick={handleExtractFromPaste}
            >
              {extracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Extract with Claude
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="clientName">Client name</Label>
        <Input
          id="clientName"
          placeholder="e.g. Waterpik"
          value={state.clientName}
          onChange={(e) => set("clientName", e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile details</CardTitle>
          <CardDescription>
            Filled in automatically from your import above - edit anything before saving.
          </CardDescription>
          <CardAction>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDetailsOpen((v) => !v)}>
              {detailsOpen ? "Hide" : "Show"}
            </Button>
          </CardAction>
        </CardHeader>
        {detailsOpen && (
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="toneOfVoice">Tone of voice</Label>
            <Textarea
              id="toneOfVoice"
              rows={2}
              value={state.toneOfVoice}
              onChange={(e) => set("toneOfVoice", e.target.value)}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dos">Do&apos;s (one per line)</Label>
              <Textarea
                id="dos"
                rows={4}
                value={state.dos}
                onChange={(e) => set("dos", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="donts">Don&apos;ts (one per line)</Label>
              <Textarea
                id="donts"
                rows={4}
                value={state.donts}
                onChange={(e) => set("donts", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bannedWords">Banned words/phrases (one per line)</Label>
            <Textarea
              id="bannedWords"
              rows={3}
              value={state.bannedWords}
              onChange={(e) => set("bannedWords", e.target.value)}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="emojiRules">Emoji rules</Label>
              <Input
                id="emojiRules"
                value={state.emojiRules}
                onChange={(e) => set("emojiRules", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hashtagRules">Hashtag rules</Label>
              <Input
                id="hashtagRules"
                value={state.hashtagRules}
                onChange={(e) => set("hashtagRules", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ctaStyle">CTA style</Label>
            <Input
              id="ctaStyle"
              value={state.ctaStyle}
              onChange={(e) => set("ctaStyle", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exampleCaptions">Example past captions (one per line, up to 10)</Label>
            <Textarea
              id="exampleCaptions"
              rows={5}
              value={state.exampleCaptions}
              onChange={(e) => set("exampleCaptions", e.target.value)}
            />
          </div>
        </CardContent>
        )}
      </Card>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-between border-t pt-6">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save profile
        </Button>
        {profile && (
          <Button variant="ghost" className="text-red-600" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
