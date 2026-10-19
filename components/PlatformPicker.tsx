"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ALL_NETWORKS,
  ALL_PLATFORM_IDS,
  NETWORK_PLATFORMS,
  PLATFORM_RULES,
  type PlatformId,
} from "@/config/platforms";
import { cn } from "@/lib/utils";

interface PlatformPickerProps {
  selected: PlatformId[];
  onChange: (selected: PlatformId[]) => void;
}

/**
 * Platforms as toggle buttons, styled like the Post format / Objective
 * controls. Each ad network is one bordered group: a network with several
 * platforms (Meta -> Instagram + Facebook) labels the group and shows every
 * platform as its own toggle, so there's nothing hidden behind a parent
 * checkbox; a single-platform network (TikTok, LinkedIn) is just one toggle.
 */
export function PlatformPicker({ selected, onChange }: PlatformPickerProps) {
  // Always hand back platforms in their canonical order (Instagram before
  // Facebook, etc.) so results tabs don't reshuffle depending on click order.
  function toggle(id: PlatformId) {
    const next = selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id];
    onChange(ALL_PLATFORM_IDS.filter((p) => next.includes(p)));
  }

  return (
    <div className="space-y-1.5">
      <Label>Platforms</Label>
      <div className="flex flex-wrap items-center gap-2">
        {ALL_NETWORKS.map((network) => {
          const members = NETWORK_PLATFORMS[network];
          return (
            <div key={network} className="inline-flex items-center gap-0.5 rounded-lg border p-0.5">
              {members.length > 1 && (
                <span className="px-2 text-xs font-medium text-muted-foreground">{network}</span>
              )}
              {members.map((id) => {
                const isOn = selected.includes(id);
                return (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={isOn ? "default" : "ghost"}
                    aria-pressed={isOn}
                    className={cn("rounded-md", !isOn && "text-muted-foreground")}
                    onClick={() => toggle(id)}
                  >
                    {PLATFORM_RULES[id].label}
                  </Button>
                );
              })}
            </div>
          );
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-muted-foreground">Pick at least one platform.</p>
      )}
    </div>
  );
}
