"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PLATFORM_RULES, ALL_PLATFORM_IDS, type PlatformId } from "@/config/platforms";

interface PlatformCheckboxesProps {
  selected: PlatformId[];
  onChange: (selected: PlatformId[]) => void;
}

export function PlatformCheckboxes({ selected, onChange }: PlatformCheckboxesProps) {
  function toggle(id: PlatformId, checked: boolean) {
    onChange(checked ? [...selected, id] : selected.filter((p) => p !== id));
  }

  return (
    <div className="flex flex-wrap gap-4">
      {ALL_PLATFORM_IDS.map((id) => (
        <div key={id} className="flex items-center gap-2">
          <Checkbox
            id={`platform-${id}`}
            checked={selected.includes(id)}
            onCheckedChange={(checked) => toggle(id, checked === true)}
          />
          <Label htmlFor={`platform-${id}`} className="cursor-pointer font-normal">
            {PLATFORM_RULES[id].label}
          </Label>
        </div>
      ))}
    </div>
  );
}
