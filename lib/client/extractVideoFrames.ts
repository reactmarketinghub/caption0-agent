"use client";

const FRAME_COUNT = 7; // within the 6-8 spec range
const HOOK_TIMESTAMP_SEC = 0.5;
const TINY_SIZE = 24; // for cheap frame-diff heuristic

// Lightweight, non-ML heuristic thresholds for the "looks VO-heavy" nudge.
// Based on mean luminance change between consecutive sampled frames (0-255 scale).
// High = lots of scene changes (fast cuts). Very low = a single static shot
// (e.g. locked-off talking head). Both patterns often mean the audio (VO/speech)
// carries the message, which we can't hear - hence the nudge to add a brief.
// These are starting points; tune after reviewing real client videos.
const FAST_CUT_THRESHOLD = 38;
const STATIC_SHOT_THRESHOLD = 3;

export interface ExtractedFrame {
  dataUrl: string;
  timestampSec: number;
}

export interface VideoFrameExtractionResult {
  frames: ExtractedFrame[];
  looksVoHeavy: boolean;
  durationSec: number;
}

function buildTimestamps(duration: number): number[] {
  const hook = Math.min(HOOK_TIMESTAMP_SEC, Math.max(0, duration - 0.05));
  const remaining = FRAME_COUNT - 1;
  const margin = duration * 0.03;
  const rest: number[] = [];
  for (let i = 0; i < remaining; i++) {
    const t = margin + (i / (remaining - 1 || 1)) * (duration - margin * 2);
    rest.push(Math.min(Math.max(t, 0), duration));
  }
  const all = [hook, ...rest].sort((a, b) => a - b);
  // de-dupe near-identical timestamps (short videos)
  const deduped: number[] = [];
  for (const t of all) {
    if (deduped.length === 0 || t - deduped[deduped.length - 1] > 0.05) {
      deduped.push(t);
    }
  }
  return deduped;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("Video seek failed"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

function grayscaleSignature(video: HTMLVideoElement): number[] {
  const canvas = document.createElement("canvas");
  canvas.width = TINY_SIZE;
  canvas.height = TINY_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(video, 0, 0, TINY_SIZE, TINY_SIZE);
  const { data } = ctx.getImageData(0, 0, TINY_SIZE, TINY_SIZE);
  const signature: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    signature.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return signature;
}

function meanAbsDiff(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Extracts 6-8 evenly spaced frames from a video file (always including a
 * ~0.5s "hook" frame), resized/encoded the same way as static images, plus a
 * cheap heuristic guess at whether the video looks VO-heavy (see threshold
 * comments above). Everything runs in the browser; the raw video is never
 * uploaded for this step.
 */
export async function extractVideoFrames(file: File): Promise<VideoFrameExtractionResult> {
  const { resizeCanvasSource } = await import("./resizeImage");

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("Could not read video metadata")), {
        once: true,
      });
    });

    const duration = video.duration || 0;
    const timestamps = buildTimestamps(duration);

    const frames: ExtractedFrame[] = [];
    const signatures: number[][] = [];

    for (const t of timestamps) {
      await seekTo(video, t);
      const dataUrl = resizeCanvasSource(video, video.videoWidth, video.videoHeight);
      frames.push({ dataUrl, timestampSec: t });
      signatures.push(grayscaleSignature(video));
    }

    let totalDiff = 0;
    for (let i = 1; i < signatures.length; i++) {
      totalDiff += meanAbsDiff(signatures[i - 1], signatures[i]);
    }
    const avgDiff = signatures.length > 1 ? totalDiff / (signatures.length - 1) : 0;
    const looksVoHeavy = avgDiff > FAST_CUT_THRESHOLD || avgDiff < STATIC_SHOT_THRESHOLD;

    return { frames, looksVoHeavy, durationSec: duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}
