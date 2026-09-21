"use client";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALL_POST_FORMATS,
  ALL_OBJECTIVES,
  ALL_AWARENESS_STAGES,
  POST_FORMAT_RULES,
  OBJECTIVE_RULES,
  AWARENESS_STAGE_RULES,
  type PostFormat,
  type Objective,
  type AwarenessStage,
} from "@/config/objectives";
import { cn } from "@/lib/utils";

interface PostSettingsFieldsProps {
  postFormat: PostFormat;
  onPostFormatChange: (value: PostFormat) => void;
  objective: Objective;
  onObjectiveChange: (value: Objective) => void;
  awarenessStage: AwarenessStage;
  onAwarenessStageChange: (value: AwarenessStage) => void;
}

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: T[];
  value: T;
  onChange: (value: T) => void;
  labelOf: (value: T) => string;
}) {
  return (
    <div className="inline-flex w-fit rounded-lg border p-0.5">
      {options.map((opt) => (
        <Button
          key={opt}
          type="button"
          size="sm"
          variant={value === opt ? "default" : "ghost"}
          className={cn("rounded-md", value !== opt && "text-muted-foreground")}
          onClick={() => onChange(opt)}
        >
          {labelOf(opt)}
        </Button>
      ))}
    </div>
  );
}

export function PostSettingsFields({
  postFormat,
  onPostFormatChange,
  objective,
  onObjectiveChange,
  awarenessStage,
  onAwarenessStageChange,
}: PostSettingsFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Post format</Label>
        <ToggleGroup
          options={ALL_POST_FORMATS}
          value={postFormat}
          onChange={onPostFormatChange}
          labelOf={(id) => POST_FORMAT_RULES[id].label}
        />
        <p className="text-xs text-muted-foreground">{POST_FORMAT_RULES[postFormat].description}</p>
      </div>

      <div className="space-y-1.5">
        <Label>Objective</Label>
        <ToggleGroup
          options={ALL_OBJECTIVES}
          value={objective}
          onChange={onObjectiveChange}
          labelOf={(id) => OBJECTIVE_RULES[id].label}
        />
        <p className="text-xs text-muted-foreground">{OBJECTIVE_RULES[objective].description}</p>
      </div>

      {objective === "awareness" && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Awareness stage</Label>
          <Select value={awarenessStage} onValueChange={(v) => onAwarenessStageChange(v as AwarenessStage)}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_AWARENESS_STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {AWARENESS_STAGE_RULES[stage].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {AWARENESS_STAGE_RULES[awarenessStage].description}
          </p>
        </div>
      )}
    </div>
  );
}
