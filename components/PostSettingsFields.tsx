"use client";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ALL_POST_FORMATS, ALL_OBJECTIVES, POST_FORMAT_RULES, OBJECTIVE_RULES, type PostFormat, type Objective } from "@/config/objectives";
import { cn } from "@/lib/utils";

interface PostSettingsFieldsProps {
  postFormat: PostFormat | null;
  onPostFormatChange: (value: PostFormat | null) => void;
  objective: Objective | null;
  onObjectiveChange: (value: Objective | null) => void;
}

const NOT_SURE = "not-sure";

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: (T | typeof NOT_SURE)[];
  value: T | null;
  onChange: (value: T | null) => void;
  labelOf: (value: T | typeof NOT_SURE) => string;
}) {
  return (
    <div className="inline-flex w-fit flex-wrap gap-0.5 rounded-lg border p-0.5">
      {options.map((opt) => {
        const isSelected = opt === NOT_SURE ? value === null : value === opt;
        return (
          <Button
            key={opt}
            type="button"
            size="sm"
            variant={isSelected ? "default" : "ghost"}
            className={cn("rounded-md", !isSelected && "text-muted-foreground")}
            onClick={() => onChange(opt === NOT_SURE ? null : opt)}
          >
            {labelOf(opt)}
          </Button>
        );
      })}
    </div>
  );
}

export function PostSettingsFields({
  postFormat,
  onPostFormatChange,
  objective,
  onObjectiveChange,
}: PostSettingsFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>
          Post format <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <ToggleGroup
          options={[NOT_SURE, ...ALL_POST_FORMATS]}
          value={postFormat}
          onChange={onPostFormatChange}
          labelOf={(id) => (id === NOT_SURE ? "Not sure" : POST_FORMAT_RULES[id].label)}
        />
        <p className="text-xs text-muted-foreground">
          {postFormat
            ? POST_FORMAT_RULES[postFormat].description
            : "Claude will infer this from the creative."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>
          Objective <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <ToggleGroup
          options={[NOT_SURE, ...ALL_OBJECTIVES]}
          value={objective}
          onChange={onObjectiveChange}
          labelOf={(id) => (id === NOT_SURE ? "Not sure" : OBJECTIVE_RULES[id].label)}
        />
        <p className="text-xs text-muted-foreground">
          {objective ? OBJECTIVE_RULES[objective].description : "Claude will infer this from the creative."}
        </p>
      </div>
    </div>
  );
}
