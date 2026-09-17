"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { resizeImageFile } from "@/lib/client/resizeImage";
import { extractVideoFrames } from "@/lib/client/extractVideoFrames";
import { uploadOriginalToBlob } from "@/lib/client/uploadToBlob";
import type { CreativeAsset, CreativeType } from "@/lib/client/creativeAsset";
import { cn } from "@/lib/utils";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

export interface UploadResult {
  creativeType: CreativeType;
  assets: CreativeAsset[];
  looksVoHeavy?: boolean;
}

interface UploadZoneProps {
  onLoaded: (result: UploadResult) => void;
  disabled?: boolean;
}

let idCounter = 0;
const nextId = () => `asset-${Date.now()}-${idCounter++}`;

export function UploadZone({ onLoaded, disabled }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      setError(null);

      const videoFile = files.find((f) => VIDEO_TYPES.includes(f.type));
      const imageFiles = files.filter((f) => IMAGE_TYPES.includes(f.type));

      if (!videoFile && imageFiles.length === 0) {
        setError(
          "That file type isn't supported. Please drop a JPG/PNG/WEBP image (or several for a carousel), or an MP4/MOV video.",
        );
        return;
      }

      setIsProcessing(true);
      try {
        if (videoFile) {
          if (files.length > 1) {
            setError("For video, please drop a single MP4/MOV file (not mixed with other files).");
          }
          void uploadOriginalToBlob(videoFile);
          const { frames, looksVoHeavy } = await extractVideoFrames(videoFile);
          onLoaded({
            creativeType: "video",
            assets: frames.map((f) => ({
              id: nextId(),
              dataUrl: f.dataUrl,
              mediaType: "image/jpeg",
              name: videoFile.name,
              timestampSec: f.timestampSec,
            })),
            looksVoHeavy,
          });
        } else {
          imageFiles.forEach((f) => void uploadOriginalToBlob(f));
          const resized = await Promise.all(
            imageFiles.map(async (f) => ({
              id: nextId(),
              dataUrl: await resizeImageFile(f),
              mediaType: "image/jpeg" as const,
              name: f.name,
            })),
          );
          onLoaded({
            creativeType: imageFiles.length > 1 ? "carousel" : "static",
            assets: resized,
          });
        }
      } catch (err) {
        console.error(err);
        setError(
          "We couldn't process that file. Please try a different image/video, or refresh and try again.",
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [onLoaded],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!disabled) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-input",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Processing creative...</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Drag & drop a creative, or click to browse</p>
              <p className="mt-1 text-sm text-muted-foreground">
                One image (static) · multiple images (carousel) · one MP4/MOV (video)
              </p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
