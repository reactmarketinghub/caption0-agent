"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BrandDocParseResult, BrandProfile, BrandProfileInput } from "@/lib/schemas";

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
  const [pasteText, setPasteText] = useState("");
  const [extracting, setExtracting] = useState(false);
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

  async function handleExtractFromFile(file: File) {
    setExtracting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/brand-doc/parse", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read that document.");
      applyExtracted(json as BrandDocParseResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that document.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleExtractFromPaste() {
    if (!pasteText.trim()) return;
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-doc/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not parse that text.");
      applyExtracted(json as BrandDocParseResult);
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
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import from a brand voice doc</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-500">
            Upload a PDF/DOCX/text file, or paste text, and Claude will fill in the fields below
            for you to review before saving.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={extracting}
              onClick={() => fileInputRef.current?.click()}
            >
              {extracting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Upload document
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleExtractFromFile(file);
                e.target.value = "";
              }}
            />
          </div>
          <Textarea
            placeholder="...or paste brand voice guidelines text here"
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
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="clientName">Client name</Label>
          <Input
            id="clientName"
            value={state.clientName}
            onChange={(e) => set("clientName", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="toneOfVoice">Tone of voice</Label>
          <Textarea
            id="toneOfVoice"
            rows={2}
            value={state.toneOfVoice}
            onChange={(e) => set("toneOfVoice", e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dos">Do&apos;s (one per line)</Label>
            <Textarea id="dos" rows={4} value={state.dos} onChange={(e) => set("dos", e.target.value)} />
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
        <div className="grid gap-4 sm:grid-cols-2">
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
          <Input id="ctaStyle" value={state.ctaStyle} onChange={(e) => set("ctaStyle", e.target.value)} />
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
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-between">
        <Button onClick={handleSave} disabled={saving}>
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
