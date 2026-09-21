"use client";

import { useState } from "react";
import { Copy, Check, RefreshCw, Scissors, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_RULES, type PlatformId } from "@/config/platforms";
import type { CaptionVariant, RefineRequest } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface CaptionVariantCardProps {
  variant: CaptionVariant;
  platform: PlatformId;
  refineContext: Omit<RefineRequest, "platform" | "currentCaption" | "instruction">;
  onUpdate: (variant: CaptionVariant) => void;
}

export function CaptionVariantCard({
  variant,
  platform,
  refineContext,
  onUpdate,
}: CaptionVariantCardProps) {
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState<RefineRequest["instruction"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rules = PLATFORM_RULES[platform];
  const isDarkPost = refineContext.postFormat === "dark-post";

  const fullText = [variant.caption, variant.hashtags.map((h) => `#${h}`).join(" ")]
    .filter(Boolean)
    .join("\n\n");

  // A dark post (ad) truncates its primary text much tighter than the
  // platform's hard character cap - flag against that limit instead when
  // it's an ad, since that's the number that actually matters here.
  const displayLimit = isDarkPost ? (rules.darkPostVisibleChars ?? rules.maxChars) : rules.maxChars;
  const limitLabel = isDarkPost ? "chars (ad limit)" : "chars";
  const overLimit = variant.char_count > displayLimit;
  const overHashtags = variant.hashtags.length > rules.maxHashtags;

  async function handleCopy() {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleAction(instruction: RefineRequest["instruction"]) {
    setBusyAction(instruction);
    setError(null);
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...refineContext,
          platform,
          currentCaption: variant.caption,
          instruction,
        } satisfies RefineRequest),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      onUpdate(json.variant as CaptionVariant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="whitespace-pre-wrap text-sm">{variant.caption}</p>
      {variant.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {variant.hashtags.map((tag) => (
            <Badge key={tag} variant="secondary">
              #{tag}
            </Badge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">{rules.network}</Badge>
          <span className={cn(overLimit && "font-medium text-red-600 dark:text-red-400")}>
            {variant.char_count.toLocaleString()} / {displayLimit.toLocaleString()} {limitLabel}
            {overLimit ? " - over limit!" : ""}
          </span>
          <span className={cn(overHashtags && "font-medium text-red-600 dark:text-red-400")}>
            {variant.hashtags.length} / {rules.maxHashtags} hashtags
            {overHashtags ? " - too many!" : ""}
          </span>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busyAction !== null}
          onClick={() => handleAction("regenerate")}
        >
          {busyAction === "regenerate" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Regenerate
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busyAction !== null}
          onClick={() => handleAction("shorter")}
        >
          {busyAction === "shorter" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Scissors className="h-3.5 w-3.5" />
          )}
          Shorter
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busyAction !== null}
          onClick={() => handleAction("punchier")}
        >
          {busyAction === "punchier" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          Punchier
        </Button>
      </div>
    </div>
  );
}
