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

export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}
