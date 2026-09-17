"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lightbulb } from "lucide-react";

interface BriefFieldProps {
  value: string;
  onChange: (value: string) => void;
  showVoNudge?: boolean;
}

export function BriefField({ value, onChange, showVoNudge }: BriefFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="brief">Brief (optional)</Label>
      <Textarea
        id="brief"
        placeholder="Key message, CTA, offer, launch date..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
      {showVoNudge && value.trim().length === 0 && (
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>
            This looks VO-heavy - consider adding a brief so captions don&apos;t miss the point.
            We can&apos;t hear the audio, so without a brief the captions will be based on visuals alone.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
