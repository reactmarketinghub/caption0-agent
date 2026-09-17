"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { BrandProfile, BrandProfileInput } from "@/lib/schemas";

interface InferredVoiceNoteProps {
  inferredVoice: string;
  onSavedDraft?: (profile: BrandProfile) => void;
}

export function InferredVoiceNote({ inferredVoice, onSavedDraft }: InferredVoiceNoteProps) {
  const [showForm, setShowForm] = useState(false);
  const [clientName, setClientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!clientName.trim()) {
      setError("Give this client a name first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input: BrandProfileInput = {
        clientName: clientName.trim(),
        toneOfVoice: inferredVoice,
        dos: [],
        donts: [],
        bannedWords: [],
        emojiRules: "",
        hashtagRules: "",
        ctaStyle: "",
        exampleCaptions: [],
        isDraft: true,
      };
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save draft profile.");
      setSaved(true);
      onSavedDraft?.(json as BrandProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save draft profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Alert>
      <Sparkles className="h-4 w-4" />
      <AlertTitle>Inferred voice</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{inferredVoice}</p>
        <p className="text-xs text-muted-foreground">
          No brand profile was used - Claude guessed this tone from the creative. Sanity-check it
          before posting.
        </p>
        {saved ? (
          <p className="text-xs font-medium text-green-600 dark:text-green-400">
            Saved as a draft profile - open it in Admin to fill in the rest.
          </p>
        ) : showForm ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Client name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="h-8 w-48"
            />
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
            {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            Save inferred voice as draft profile
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
