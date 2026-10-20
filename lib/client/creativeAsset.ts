export type CreativeType = "static" | "carousel" | "video";

export interface CreativeAsset {
  id: string;
  /** JPEG data URL, already resized for sending to Claude. */
  dataUrl: string;
  mediaType: "image/jpeg";
  name: string;
  /** For video frames: approximate timestamp in seconds this frame was captured at. */
  timestampSec?: number;
}

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/**
 * The image type a data URL says it is ("data:image/png;base64,..."), falling
 * back to JPEG (what the app itself always sends). Claude rejects an image
 * whose declared type doesn't match its bytes, so never assume JPEG for a
 * PNG/WebP/GIF that reaches the server.
 */
export function mediaTypeFromDataUrl(dataUrl: string): SupportedImageType {
  const declared = /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1]?.toLowerCase();
  return SUPPORTED_IMAGE_TYPES.find((t) => t === declared) ?? "image/jpeg";
}

export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}
