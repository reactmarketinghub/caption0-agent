"use client";

const FRAME_COUNT = 7; // final frames sent to Claude, within the 6-8 spec range
// Cheap low-res probes (see grayscaleSignature) used only to find where the
// video actually changes - not sent to Claude and not part of FRAME_COUNT.
const PROBE_COUNT = 16;
const HOOK_TIMESTAMP_SEC = 0.5;
const TINY_SIZE = 24; // for cheap frame-diff heuristic

// Lightweight, non-ML heuristic thresholds for the "looks VO-heavy" flag.
// Based on mean luminance change between consecutive sampled frames (0-255 scale).
// High = lots of scene changes (fast cuts). Very low = a single static shot
// (e.g. locked-off talking head). Both patterns often mean the audio (VO/speech)
// carries the message, which we can't hear - the flag makes the system prompt
// lean harder on on-screen text and stay conservative (see lib/prompts.ts).
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

function evenlySpaced(count: number, duration: number): number[] {
  const margin = duration * 0.03;
  const usable = Math.max(duration - margin * 2, 0);
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = margin + (i / (count - 1 || 1)) * usable;
    points.push(Math.min(Math.max(t, 0), duration));
  }
  return points;
}

function dedupeSorted(timestamps: number[], minGapSec: number): number[] {
  const sorted = [...timestamps].sort((a, b) => a - b);
  const result: number[] = [];
  for (const t of sorted) {
    if (result.length === 0 || t - result[result.length - 1] > minGapSec) {
      result.push(t);
    }
  }
  return result;
}

/**
 * Picks which FRAME_COUNT timestamps to actually send to Claude, biased
 * toward where the video visually changes (cuts, new shots) rather than a
 * fixed offset that might land mid-static-shot right next to an actual cut.
 * `probeSignatures[i]` must correspond to `probeTimestamps[i]`.
 *
 * Coverage is guaranteed by construction, not by a greedy fallback: after
 * the hook, the probed range is split into FRAME_COUNT-1 equal-duration
 * buckets spanning the whole video, and each bucket contributes whichever
 * of its own probes differs most from the probe before it. A video with no
 * real cuts (a locked-off static shot) still gets one frame per bucket,
 * same as the old uniform sampling; a video with real cuts gets each
 * bucket's frame pulled toward its nearest cut instead of an arbitrary
 * offset. (An earlier version ranked all probes by activity globally and
 * tie-broke by chronological order, which let a handful of early, equally
 * "inactive" probes fill the whole quota and left most of the video
 * unsampled - the per-bucket split can't do that, since every bucket is
 * guaranteed exactly one pick.)
 */
function pickSceneAwareTimestamps(
  duration: number,
  probeTimestamps: number[],
  probeSignatures: number[][],
): number[] {
  const hook = Math.min(HOOK_TIMESTAMP_SEC, Math.max(0, duration - 0.05));
  if (probeTimestamps.length === 0) return [hook];

  // Activity = how much a probe differs from the one right before it.
  const activity = probeTimestamps.map((_, i) =>
    i === 0 ? 0 : meanAbsDiff(probeSignatures[i - 1], probeSignatures[i]),
  );

  const remainingSlots = FRAME_COUNT - 1;
  const rangeStart = probeTimestamps[0];
  const rangeEnd = probeTimestamps[probeTimestamps.length - 1];
  const bucketEdges = Array.from(
    { length: remainingSlots + 1 },
    (_, i) => rangeStart + ((rangeEnd - rangeStart) * i) / remainingSlots,
  );

  const picks: number[] = [];
  for (let b = 0; b < remainingSlots; b++) {
    const lo = bucketEdges[b];
    const hi = bucketEdges[b + 1];
    let bestT: number | null = null;
    let bestScore = -1;
    for (let i = 0; i < probeTimestamps.length; i++) {
      const t = probeTimestamps[i];
      if (t < lo || t > hi) continue;
      if (activity[i] > bestScore) {
        bestScore = activity[i];
        bestT = t;
      }
    }
    picks.push(bestT ?? (lo + hi) / 2);
  }

  return dedupeSorted([hook, ...picks], 0.05).slice(0, FRAME_COUNT);
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
 * Extracts up to FRAME_COUNT frames from a video file (always including a
 * ~0.5s "hook" frame), resized/encoded the same way as static images, plus a
 * cheap heuristic guess at whether the video looks VO-heavy (see threshold
 * comments above). Everything runs in the browser; the raw video is never
 * uploaded for this step.
 *
 * Two passes: first a cheap low-res probe pass across the whole video to
 * find where it actually changes (scene cuts) vs. where it's static, then a
 * second pass that seeks to only the chosen timestamps to capture the real
 * frames - so the extra probing cost stays small (tiny 24x24 reads) while
 * the frames actually sent to Claude land where the content changes instead
 * of an arbitrary uniform grid.
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

    const probeTimestamps = evenlySpaced(PROBE_COUNT, duration);
    const probeSignatures: number[][] = [];
    for (const t of probeTimestamps) {
      await seekTo(video, t);
      probeSignatures.push(grayscaleSignature(video));
    }

    const timestamps = pickSceneAwareTimestamps(duration, probeTimestamps, probeSignatures);

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
