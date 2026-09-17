"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaptionVariantCard } from "./CaptionVariantCard";
import { InferredVoiceNote } from "./InferredVoiceNote";
import { PLATFORM_RULES } from "@/config/platforms";
import type { GenerationResponse, CaptionVariant, RefineRequest, BrandProfile } from "@/lib/schemas";

interface CaptionResultsProps {
  results: GenerationResponse;
  onResultsChange: (results: GenerationResponse) => void;
  refineContext: Omit<RefineRequest, "platform" | "currentCaption" | "instruction">;
  onSavedDraftProfile?: (profile: BrandProfile) => void;
}

export function CaptionResults({
  results,
  onResultsChange,
  refineContext,
  onSavedDraftProfile,
}: CaptionResultsProps) {
  const [activeTab, setActiveTab] = useState(results.platforms[0]?.platform);

  function updateVariant(platform: string, index: number, variant: CaptionVariant) {
    onResultsChange({
      ...results,
      platforms: results.platforms.map((p) =>
        p.platform === platform
          ? { ...p, variants: p.variants.map((v, i) => (i === index ? variant : v)) }
          : p,
      ),
    });
  }

  return (
    <div className="space-y-4">
      {results.inferred_voice && (
        <InferredVoiceNote
          inferredVoice={results.inferred_voice}
          onSavedDraft={onSavedDraftProfile}
        />
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {results.platforms.map((p) => (
            <TabsTrigger key={p.platform} value={p.platform}>
              {PLATFORM_RULES[p.platform].label}
            </TabsTrigger>
          ))}
        </TabsList>
        {results.platforms.map((p) => (
          <TabsContent key={p.platform} value={p.platform} className="space-y-3">
            {p.variants.map((variant, i) => (
              <CaptionVariantCard
                key={i}
                variant={variant}
                platform={p.platform}
                refineContext={refineContext}
                onUpdate={(v) => updateVariant(p.platform, i, v)}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
