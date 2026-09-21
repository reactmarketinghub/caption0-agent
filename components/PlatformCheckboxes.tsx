"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PLATFORM_RULES, ALL_NETWORKS, NETWORK_PLATFORMS, type PlatformId, type AdNetwork } from "@/config/platforms";

interface PlatformCheckboxesProps {
  selected: PlatformId[];
  onChange: (selected: PlatformId[]) => void;
}

export function PlatformCheckboxes({ selected, onChange }: PlatformCheckboxesProps) {
  function toggle(network: AdNetwork, checked: boolean) {
    const members = NETWORK_PLATFORMS[network];
    onChange(
      checked
        ? [...selected, ...members.filter((m) => !selected.includes(m))]
        : selected.filter((p) => !members.includes(p)),
    );
  }

  return (
    <div className="flex flex-wrap gap-4">
      {ALL_NETWORKS.map((network) => {
        const members = NETWORK_PLATFORMS[network];
        const checked = members.every((m) => selected.includes(m));
        const label =
          members.length > 1
            ? `${network} (${members.map((m) => PLATFORM_RULES[m].label).join(" + ")})`
            : network;
        return (
          <div key={network} className="flex items-center gap-2">
            <Checkbox
              id={`network-${network}`}
              checked={checked}
              onCheckedChange={(c) => toggle(network, c === true)}
              className="data-checked:border-brand-gold data-checked:bg-brand-gold data-checked:text-black dark:data-checked:border-brand-gold dark:data-checked:bg-brand-gold"
            />
            <Label htmlFor={`network-${network}`} className="cursor-pointer font-normal">
              {label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
