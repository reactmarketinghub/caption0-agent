"use client";

import { useState } from "react";
import { Loader2, RotateCcw, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadZone, type UploadResult } from "./UploadZone";
import { CarouselThumbnails } from "./CarouselThumbnails";
import { ClientSelector } from "./ClientSelector";
import { PostSettingsFields } from "./PostSettingsFields";
import { PlatformCheckboxes } from "./PlatformCheckboxes";
import { CaptionResults } from "./CaptionResults";
import { ALL_PLATFORM_IDS, type PlatformId } from "@/config/platforms";
import type { PostFormat, Objective } from "@/config/objectives";
import type { CreativeAsset, CreativeType } from "@/lib/client/creativeAsset";
import type { BrandProfile, GenerationResponse } from "@/lib/schemas";

export function CaptionGenerator() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [creativeType, setCreativeType] = useState<CreativeType | null>(null);
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [looksVoHeavy, setLooksVoHeavy] = useState(false);
  const [postFormat, setPostFormat] = useState<PostFormat>("grid");
  const [objective, setObjective] = useState<Objective>("traffic");
  const [platforms, setPlatforms] = useState<PlatformId[]>(ALL_PLATFORM_IDS);
  const [results, setResults] = useState<GenerationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientListVersion, setClientListVersion] = useState(0);

  function handleSavedDraftProfile(profile: BrandProfile) {
    setClientId(profile.id);
    setClientListVersion((v) => v + 1);
  }

  function handleUploadLoaded(result: UploadResult) {
    setCreativeType(result.creativeType);
    setAssets(result.assets);
    setLooksVoHeavy(Boolean(result.looksVoHeavy));
    setResults(null);
    setError(null);
  }

  function handleReset() {
    setCreativeType(null);
    setAssets([]);
    setLooksVoHeavy(false);
    setResults(null);
    setError(null);
  }

  async function handleGenerate() {
    if (!creativeType || assets.length === 0 || platforms.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId ?? undefined,
          postFormat,
          objective,
          platforms,
          creativeType,
          images: assets.map((a) => a.dataUrl),
          videoLooksVoHeavy: creativeType === "video" ? looksVoHeavy : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setResults(json as GenerationResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const refineContext = {
    clientId: clientId ?? undefined,
    postFormat,
    objective,
    creativeType: creativeType ?? "static",
    images: assets.map((a) => a.dataUrl),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Caption <span className="font-serif font-normal italic text-accent-gold-text">Generator</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Drop a creative, pick a client, get ready-to-post captions.
        </p>
      </div>

      <ClientSelector key={clientListVersion} value={clientId} onChange={setClientId} />

      {assets.length === 0 ? (
        <UploadZone onLoaded={handleUploadLoaded} />
      ) : (
        <div className="space-y-4 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium capitalize">{creativeType} creative loaded</span>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Start over
            </Button>
          </div>

          {creativeType === "carousel" && (
            <CarouselThumbnails
              assets={assets}
              onReorder={setAssets}
              onRemove={(id) => setAssets((prev) => prev.filter((a) => a.id !== id))}
            />
          )}

          {creativeType === "static" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assets[0].dataUrl}
              alt="Creative preview"
              className="h-48 w-auto rounded-lg border object-contain"
            />
          )}

          {creativeType === "video" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Film className="h-4 w-4" />
              <span>
                {assets.length} frames extracted (no audio is sent or analyzed).
                {looksVoHeavy &&
                  " This looks voiceover/dialogue-heavy - captions will lean on visuals and on-screen text only."}
              </span>
            </div>
          )}
          {creativeType === "video" && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {assets.map((a) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={a.id}
                  src={a.dataUrl}
                  alt={`Frame at ${a.timestampSec?.toFixed(1)}s`}
                  className="h-20 w-auto flex-shrink-0 rounded border object-cover"
                />
              ))}
            </div>
          )}
        </div>
      )}

      <PostSettingsFields
        postFormat={postFormat}
        onPostFormatChange={setPostFormat}
        objective={objective}
        onObjectiveChange={setObjective}
      />

      <PlatformCheckboxes selected={platforms} onChange={setPlatforms} />

      <Button
        onClick={handleGenerate}
        disabled={loading || assets.length === 0 || platforms.length === 0}
        size="lg"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Generate captions
      </Button>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {results && (
        <CaptionResults
          results={results}
          onResultsChange={setResults}
          refineContext={refineContext}
          onSavedDraftProfile={handleSavedDraftProfile}
        />
      )}
    </div>
  );
}
