export interface ExtractableFile {
  buffer: Buffer;
  name: string;
  type: string;
}

// Caps how many pages a no-text-layer PDF falls back to rendering as images
// (see renderPdfPagesAsImages) - bounds cost/latency the same way
// MAX_DOC_CHARS bounds extracted text, for a brand deck that turns out to be
// dozens of pages long.
const MAX_PDF_SCREENSHOT_PAGES = 8;

/** Extracts plain text from a brand voice doc or slide deck (PDF, PPTX, DOCX, or plain text). */
export async function extractTextFromFile({ buffer, name, type }: ExtractableFile): Promise<string> {
  const lowerName = name.toLowerCase();

  if (type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      // pdf-parse's own default pageJoiner ("-- page_number of total_number
      // --") gets injected into every page's text unconditionally - even a
      // fully blank/text-less page - so without overriding it here,
      // result.text is never actually empty and the no-text-layer check
      // below (and the PDF screenshot fallback it gates) would never fire.
      const result = await parser.getText({ pageJoiner: "" });
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    lowerName.endsWith(".pptx")
  ) {
    return extractPptxText(buffer);
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  return buffer.toString("utf-8");
}

// Pages go to Claude as images, and a graphics-heavy deck rendered as PNG is
// enormous (a photo-heavy 1920px slide is ~10MB as PNG - Claude rejects any
// single image over 5MB and any request over ~32MB, and reading that much
// pixel data was also what made these uploads slow or fail with a generic
// error). So render at a width Claude actually uses (it downsizes anything
// bigger anyway) and re-encode as JPEG, then keep the total under a budget.
const PDF_PAGE_WIDTH_PX = 1280;
const PDF_PAGE_JPEG_QUALITY = 70;
const PDF_PAGE_JPEG_FALLBACK_QUALITY = 45;
const PDF_PAGES_TOTAL_BUDGET_BYTES = 12 * 1024 * 1024;

export interface RenderedPdfPage {
  dataUrl: string;
  mediaType: "image/jpeg";
}

/**
 * Renders a PDF's pages to compact JPEG data URLs - the fallback for a PDF
 * with no extractable text layer at all, which getText() returns empty/blank
 * for (a scanned brand deck, or a "compressed"/flattened export where every
 * page is really just one embedded raster image - compression tools commonly
 * do this to shrink file size, which strips the real text layer in the
 * process). Claude's vision can still read these as images, the same way an
 * uploaded screenshot already works - this just gets a PDF's pages into
 * that same pipeline instead of failing the whole file.
 */
export async function renderPdfPagesAsImages(buffer: Buffer): Promise<RenderedPdfPage[]> {
  const { PDFParse } = await import("pdf-parse");
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getScreenshot({
      first: MAX_PDF_SCREENSHOT_PAGES,
      desiredWidth: PDF_PAGE_WIDTH_PX,
      imageBuffer: true,
      imageDataUrl: false,
    });

    const pages: RenderedPdfPage[] = [];
    let totalBytes = 0;
    for (const page of result.pages) {
      const img = await loadImage(Buffer.from(page.data));
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      // JPEG has no transparency - flatten onto white so transparent slide
      // backgrounds don't turn black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);

      let jpeg = canvas.toBuffer("image/jpeg", PDF_PAGE_JPEG_QUALITY);
      if (totalBytes + jpeg.length > PDF_PAGES_TOTAL_BUDGET_BYTES) {
        jpeg = canvas.toBuffer("image/jpeg", PDF_PAGE_JPEG_FALLBACK_QUALITY);
      }
      // Out of budget: the pages so far still carry the deck's gist, and a
      // partial read beats a request Claude rejects outright.
      if (totalBytes + jpeg.length > PDF_PAGES_TOTAL_BUDGET_BYTES) break;

      totalBytes += jpeg.length;
      pages.push({ dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, mediaType: "image/jpeg" });
    }
    return pages;
  } finally {
    await parser.destroy();
  }
}

const IMAGE_SHRINK_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
const IMAGE_MAX_EDGE_PX = 1568;

/**
 * An uploaded screenshot can be many MB (retina PNGs routinely are), and
 * Claude rejects any single image over 5MB - so anything big is downscaled to
 * the size Claude actually reads at (1568px long edge) and re-encoded as JPEG.
 * Small images pass through untouched so legible text isn't degraded for no
 * reason.
 */
export async function shrinkImageIfLarge(
  buffer: Buffer,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<{ dataUrl: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" }> {
  if (buffer.length <= IMAGE_SHRINK_THRESHOLD_BYTES) {
    return { dataUrl: `data:${mediaType};base64,${buffer.toString("base64")}`, mediaType };
  }
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const img = await loadImage(buffer);
  const scale = Math.min(1, IMAGE_MAX_EDGE_PX / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const jpeg = canvas.toBuffer("image/jpeg", 80);
  return { dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, mediaType: "image/jpeg" };
}

/** PPTX is a zip of per-slide XML - pull the visible text runs out in slide order. */
async function extractPptxText(buffer: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => {
      const numA = Number(a.match(/\d+/)?.[0] ?? 0);
      const numB = Number(b.match(/\d+/)?.[0] ?? 0);
      return numA - numB;
    });

  const slideTexts: string[] = [];
  for (const path of slideFiles) {
    const xml = await zip.files[path].async("text");
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    if (runs.length) slideTexts.push(runs.join(" "));
  }
  return slideTexts.join("\n\n");
}
