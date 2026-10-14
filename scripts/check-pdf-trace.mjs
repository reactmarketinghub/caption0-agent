// Runs after `next build` (see the "build" script in package.json).
//
// PDF parsing needs native files that only reach the deployed function if
// Next's file tracing includes them - see the note in next.config.ts. When
// that silently breaks, everything still builds and runs locally, and PDFs
// just fail in production with "DOMMatrix is not defined". This fails the
// build instead, so a broken deploy never goes live (Vercel keeps serving the
// previous deployment when a build fails).
//
// Keep ROUTES in sync with PDF_ROUTES in next.config.ts.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES = ["api/brand-doc/parse", "api/clients/[id]/brand-kit"];

const REQUIRED = [
  { label: "@napi-rs/canvas package", test: (f) => f.includes("node_modules/@napi-rs/canvas/") },
  { label: "native canvas binary (.node)", test: (f) => /node_modules\/@napi-rs\/canvas-[^/]+\/.*\.node$/.test(f) },
  { label: "pdfjs-dist", test: (f) => f.includes("node_modules/pdfjs-dist/") },
  { label: "pdf-parse", test: (f) => f.includes("node_modules/pdf-parse/") },
];

const problems = [];
for (const route of ROUTES) {
  const nftPath = join(".next", "server", "app", route, "route.js.nft.json");
  if (!existsSync(nftPath)) {
    problems.push(`${route}: no trace file at ${nftPath} (route renamed? update ROUTES here and PDF_ROUTES in next.config.ts)`);
    continue;
  }
  const files = JSON.parse(readFileSync(nftPath, "utf8")).files.map((f) => f.replaceAll("\\", "/"));
  for (const { label, test } of REQUIRED) {
    if (!files.some(test)) problems.push(`${route}: ${label} is not shipped with this route`);
  }
}

if (problems.length) {
  console.error("\nPDF runtime check FAILED - PDF uploads would break in production:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nSee the PDF notes in next.config.ts and CLAUDE.md.\n");
  process.exit(1);
}
console.log(`PDF runtime check passed (${ROUTES.length} routes ship pdf-parse, pdfjs-dist and the native canvas binary).`);
