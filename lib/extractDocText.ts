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

/**
 * Renders a PDF's pages to PNG data URLs - the fallback for a PDF with no
 * extractable text layer at all, which getText() returns empty/blank for
 * (a scanned brand deck, or a "compressed"/flattened export where every page
 * is really just one embedded raster image - compression tools commonly do
 * this to shrink file size, which strips the real text layer in the
 * process). Claude's vision can still read these as images, the same way an
 * uploaded screenshot already works - this just gets a PDF's pages into
 * that same pipeline instead of failing the whole file.
 */
export async function renderPdfPagesAsImages(buffer: Buffer): Promise<string[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getScreenshot({ first: MAX_PDF_SCREENSHOT_PAGES, scale: 1.5 });
    return result.pages.map((p) => p.dataUrl);
  } finally {
    await parser.destroy();
  }
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
