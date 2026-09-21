"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles, Trash2, UploadCloud, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandKitSection } from "@/components/BrandKitSection";
import { cn } from "@/lib/utils";
import type { BrandDocParseResult, BrandProfile, BrandProfileInput } from "@/lib/schemas";

const ACCEPTED_EXTENSIONS = ".pptx,.pdf,.docx,.txt";
const ACCEPTED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
].join(",");

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
  const [extractedFrom, setExtractedFrom] = useState<string | null>(null);
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
  }

  const handleExtractFromFile = useCallback(async (file: File) => {
    setExtracting(true);
    setError(null);
    setExtractedFrom(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/brand-doc/parse", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read that file.");
      applyExtracted(json as BrandDocParseResult);
      setExtractedFrom(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setExtracting(false);
    }
  }, []);

  async function handleExtractFromPaste() {
    if (!pasteText.trim()) return;
    setExtracting(true);
    setError(null);
    setExtractedFrom(null);
    try {
      const res = await fetch("/api/brand-doc/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not parse that text.");
      applyExtracted(json as BrandDocParseResult);
      setExtractedFrom("pasted text");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse that text.");
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
          <h2 className="text-lg font-semibold">Import from a deck or doc</h2>
          <p className="text-sm text-muted-foreground">
            Drop a brand deck or guidelines file and Claude fills in everything below for you to
            review before saving.
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
            const file = e.dataTransfer.files?.[0];
            if (file && !extracting) void handleExtractFromFile(file);
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
              <p className="font-medium">Drag & drop a deck or doc, or click to browse</p>
              <p className="text-sm text-muted-foreground">PPTX · PDF · DOCX · TXT</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={`${ACCEPTED_EXTENSIONS},${ACCEPTED_MIME_TYPES}`}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleExtractFromFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {extractedFrom && !extracting && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            Extracted from {extractedFrom} - review the fields below before saving.
          </p>
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
        </CardHeader>
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
