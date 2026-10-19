"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ALL_NETWORKS,
  ALL_PLATFORM_IDS,
  NETWORK_PLATFORMS,
  PLATFORM_RULES,
  type AdNetwork,
  type PlatformId,
} from "@/config/platforms";

interface PlatformCheckboxesProps {
  selected: PlatformId[];
  onChange: (selected: PlatformId[]) => void;
}

const CHECKBOX_COLOR =
  "data-checked:border-brand-gold data-checked:bg-brand-gold data-checked:text-black dark:data-checked:border-brand-gold dark:data-checked:bg-brand-gold";

export function PlatformCheckboxes({ selected, onChange }: PlatformCheckboxesProps) {
  // Always hand back platforms in their canonical order (Instagram before
  // Facebook, etc.) so results tabs don't reshuffle depending on click order.
  function emit(next: PlatformId[]) {
    onChange(ALL_PLATFORM_IDS.filter((id) => next.includes(id)));
  }

  function toggleNetwork(network: AdNetwork) {
    const members = NETWORK_PLATFORMS[network];
    const anySelected = members.some((m) => selected.includes(m));
    emit(anySelected ? selected.filter((p) => !members.includes(p)) : [...selected, ...members]);
  }

  function togglePlatform(id: PlatformId, checked: boolean) {
    emit(checked ? [...selected, id] : selected.filter((p) => p !== id));
  }

  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
      {ALL_NETWORKS.map((network) => {
        const members = NETWORK_PLATFORMS[network];
        const anySelected = members.some((m) => selected.includes(m));
        const hasChoices = members.length > 1;
        return (
          <div key={network} className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`network-${network}`}
                checked={anySelected}
                onCheckedChange={() => toggleNetwork(network)}
                className={CHECKBOX_COLOR}
              />
              <Label htmlFor={`network-${network}`} className="cursor-pointer font-normal">
                {network}
              </Label>
            </div>
            {/* Pick which of the network's platforms you actually want (e.g.
                just Instagram, or just Facebook) - shown once the network is on. */}
            {hasChoices && anySelected && (
              <div className="ml-6 flex flex-wrap gap-x-4 gap-y-2">
                {members.map((id) => (
                  <div key={id} className="flex items-center gap-2">
                    <Checkbox
                      id={`platform-${id}`}
                      checked={selected.includes(id)}
                      onCheckedChange={(c) => togglePlatform(id, c === true)}
                      className={CHECKBOX_COLOR}
                    />
                    <Label htmlFor={`platform-${id}`} className="cursor-pointer text-sm font-normal">
                      {PLATFORM_RULES[id].label}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
