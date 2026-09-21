export interface ExtractableFile {
  buffer: Buffer;
  name: string;
  type: string;
}

/** Extracts plain text from a brand voice doc or slide deck (PDF, PPTX, DOCX, or plain text). */
export async function extractTextFromFile({ buffer, name, type }: ExtractableFile): Promise<string> {
  const lowerName = name.toLowerCase();

  if (type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
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
