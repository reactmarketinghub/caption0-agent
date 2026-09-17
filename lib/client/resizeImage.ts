"use client";

const MAX_LONG_EDGE = 1568;
const JPEG_QUALITY = 0.85;

/**
 * Resizes an image file (or already-loaded HTMLImageElement/canvas source) to a max
 * long-edge of 1568px client-side and re-encodes as JPEG. Runs entirely in the
 * browser so the server never sees full-resolution uploads for the Claude call.
 */
export async function resizeImageFile(
  file: File,
  maxLongEdge: number = MAX_LONG_EDGE,
  quality: number = JPEG_QUALITY,
): Promise<string> {
  const bitmap = await loadBitmap(file);
  try {
    return drawAndEncode(bitmap, maxLongEdge, quality);
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}

/** Same resize/encode pipeline, but from an already-decoded canvas image source (used for video frames). */
export function resizeCanvasSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge: number = MAX_LONG_EDGE,
  quality: number = JPEG_QUALITY,
): string {
  return drawAndEncode(source, maxLongEdge, quality, sourceWidth, sourceHeight);
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  return await createImageBitmap(file);
}

function drawAndEncode(
  source: CanvasImageSource,
  maxLongEdge: number,
  quality: number,
  knownWidth?: number,
  knownHeight?: number,
): string {
  const width =
    knownWidth ??
    (source as ImageBitmap).width ??
    (source as HTMLVideoElement).videoWidth;
  const height =
    knownHeight ??
    (source as ImageBitmap).height ??
    (source as HTMLVideoElement).videoHeight;

  const longEdge = Math.max(width, height);
  const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(source, 0, 0, targetW, targetH);

  return canvas.toDataURL("image/jpeg", quality);
}
