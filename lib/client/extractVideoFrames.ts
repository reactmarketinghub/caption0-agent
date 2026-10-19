"use client";

// "Key" frames: the scene-aware picks (plus the hook), kept at full resolution so
// on-screen text stays legible. Everything else is a small, cheap "extra" frame.
const FRAME_COUNT = 7;
// As many frames as the request can carry: one every PROBE_INTERVAL_SEC, up to
// MAX_PROBE_COUNT (never fewer than MIN_PROBE_COUNT). Each probe doubles as a
// small extra frame, so more coverage costs one extra seek, not a second pass.
const PROBE_INTERVAL_SEC = 0.75;
const MIN_PROBE_COUNT = 16;
const MAX_PROBE_COUNT = 48;
const EXTRA_FRAME_LONG_EDGE = 640;
const EXTRA_FRAME_QUALITY = 0.6;
// The frames travel in one JSON request to /api/generate, and Vercel rejects a
// request body over ~4.5MB. Stay safely under it (JSON + the rest of the body
// need room too) by thinning extra frames if the set is too big.
const MAX_TOTAL_DATAURL_CHARS = 3_600_000;
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
 * Combines the sharp key frames with the small extra frames (a key frame
 * replaces the extra taken at the same moment), in time order, then thins the
 * extras - never the key frames - until the whole set fits the request budget.
 * Thinning always drops the extra whose neighbours are closest together, so
 * coverage of the video stays as even as possible.
 */
export function mergeAndFit(keyFrames: ExtractedFrame[], extraFrames: ExtractedFrame[]): ExtractedFrame[] {
  const isKey = new Set(keyFrames);
  const extras = extraFrames.filter(
    (e) => !keyFrames.some((k) => Math.abs(k.timestampSec - e.timestampSec) < 0.02),
  );
  const all = [...keyFrames, ...extras].sort((a, b) => a.timestampSec - b.timestampSec);
  let total = all.reduce((n, f) => n + f.dataUrl.length, 0);

  while (total > MAX_TOTAL_DATAURL_CHARS) {
    let dropAt = -1;
    let smallestGap = Infinity;
    for (let i = 0; i < all.length; i++) {
      if (isKey.has(all[i])) continue;
      const prev = all[i - 1]?.timestampSec ?? all[i].timestampSec;
      const next = all[i + 1]?.timestampSec ?? all[i].timestampSec;
      const gap = next - prev;
      if (gap < smallestGap) {
        smallestGap = gap;
        dropAt = i;
      }
    }
    if (dropAt === -1) break; // only key frames left
    total -= all[dropAt].dataUrl.length;
    all.splice(dropAt, 1);
  }
  return all;
}

/**
 * Extracts as many frames as the request can carry from a video file: a few
 * full-resolution key frames (scene cuts plus a ~0.5s "hook" frame) and up to
 * ~48 small frames spread across the whole video, plus a
 * cheap heuristic guess at whether the video looks VO-heavy (see threshold
 * comments above). Everything runs in the browser; the raw video is never
 * uploaded for this step.
 *
 * Two passes: first one sweep across the whole video that records both a tiny
 * signature (to find where it actually changes - scene cuts vs. static shots)
 * and a small JPEG per probe, then a second pass that re-captures only the
 * chosen key timestamps at full resolution, so the frames that matter most
 * (cuts, the hook) are sharp enough to read on-screen text from.
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

    // Pass 1: one pass over the whole video. Each probe records a tiny
    // signature (to find where the video changes) and a small JPEG (an extra
    // frame to send as-is).
    const probeCount = Math.min(
      MAX_PROBE_COUNT,
      Math.max(MIN_PROBE_COUNT, Math.ceil(duration / PROBE_INTERVAL_SEC) + 1),
    );
    const probeTimestamps = evenlySpaced(probeCount, duration);
    const probeSignatures: number[][] = [];
    const extraFrames: ExtractedFrame[] = [];
    for (const t of probeTimestamps) {
      await seekTo(video, t);
      probeSignatures.push(grayscaleSignature(video));
      extraFrames.push({
        dataUrl: resizeCanvasSource(
          video,
          video.videoWidth,
          video.videoHeight,
          EXTRA_FRAME_LONG_EDGE,
          EXTRA_FRAME_QUALITY,
        ),
        timestampSec: t,
      });
    }

    // Pass 2: re-capture the scene-aware key frames at full resolution.
    const keyTimestamps = pickSceneAwareTimestamps(duration, probeTimestamps, probeSignatures);
    const keyFrames: ExtractedFrame[] = [];
    const signatures: number[][] = [];
    for (const t of keyTimestamps) {
      await seekTo(video, t);
      const dataUrl = resizeCanvasSource(video, video.videoWidth, video.videoHeight);
      keyFrames.push({ dataUrl, timestampSec: t });
      signatures.push(grayscaleSignature(video));
    }

    let totalDiff = 0;
    for (let i = 1; i < signatures.length; i++) {
      totalDiff += meanAbsDiff(signatures[i - 1], signatures[i]);
    }
    const avgDiff = signatures.length > 1 ? totalDiff / (signatures.length - 1) : 0;
    const looksVoHeavy = avgDiff > FAST_CUT_THRESHOLD || avgDiff < STATIC_SHOT_THRESHOLD;

    return { frames: mergeAndFit(keyFrames, extraFrames), looksVoHeavy, durationSec: duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}
