import type { NextConfig } from "next";

// The two routes that parse uploaded PDFs (brand-doc import and brand-kit
// auto-extraction) - see the pdf-parse note below.
const PDF_ROUTES = ["/api/brand-doc/parse", "/api/clients/\\[id\\]/brand-kit"];
const PDF_RUNTIME_FILES = [
  "./node_modules/@napi-rs/canvas/**/*",
  "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
  "./node_modules/pdfjs-dist/legacy/build/**/*",
];

const nextConfig: NextConfig = {
  // pdf-parse -> pdfjs-dist polyfills DOMMatrix at runtime with
  // `createRequire(import.meta.url)("@napi-rs/canvas")`. If Next bundles it
  // into the route chunk, that lookup resolves from inside the bundle, and the
  // native canvas package (a dynamic require with a platform-specific .node
  // binary) never gets traced into the Vercel function - so PDF extraction
  // dies with "DOMMatrix is not defined" in production while working fine
  // locally, where node_modules is sitting right there. Externalizing keeps
  // them as plain node_modules requires; the includes below make sure the
  // Linux binary Vercel actually runs on ships with those routes.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: Object.fromEntries(PDF_ROUTES.map((route) => [route, PDF_RUNTIME_FILES])),
};

export default nextConfig;
