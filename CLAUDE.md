# CLAUDE.md

Internal caption generator for Re:Act's social media team. Drag in a creative,
pick a client, get ready-to-post Instagram/TikTok/Facebook/LinkedIn captions.

## Stack

- Next.js 16 (App Router, TypeScript), deployed on Vercel
- Tailwind CSS + shadcn/ui (Base UI primitives under the hood, not Radix -
  shadcn components here use a `render` prop instead of `asChild` to swap
  the rendered element, e.g. `<Button render={<Link href="/x" />}>`)
- `@anthropic-ai/sdk` called server-side only, never from the browser
- Vercel Blob for short-lived original-upload storage (client-side uploads,
  since Vercel functions cap request bodies at ~4.5MB)
- Vercel KV (Upstash Redis) for brand profiles, rate limiting, and generation
  logs
- Auth.js v5 (`next-auth@beta`) with Google sign-in restricted to one email
  domain

## Architecture

```
config/platforms.ts          Per-platform limits/style rules (edit freely, no code changes needed elsewhere)

lib/
  anthropic.ts                Anthropic client + CLAUDE_MODEL constant (bump this one line to upgrade models)
  claudeGenerate.ts           generateStructured(): calls Claude, parses/validates JSON with zod, retries once
  prompts.ts                  System prompt builders (Mode A/B, video no-audio disclaimer, brand-doc parsing)
  schemas.ts                  zod schemas: BrandProfile, GenerationResponse, API request bodies
  kv.ts                       Vercel KV wrapper: brand profiles, rate limiting, generation logs
  auth.ts                     Auth.js config + getCurrentUserEmail()
  usage.ts                    Token -> USD cost estimate + usage report aggregation
  extractDocText.ts           PDF/DOCX/text -> plain text for the brand-doc-to-profile flow
  client/                     Browser-only helpers: image resize, video frame extraction, Blob upload

components/
  UploadZone.tsx               Single drop zone; classifies dropped files as static/carousel/video
  CarouselThumbnails.tsx       Drag-to-reorder carousel thumbnails (dnd-kit)
  CaptionGenerator.tsx          Main page orchestrator (client component)
  CaptionResults.tsx / CaptionVariantCard.tsx    Per-platform tabs, copy/regenerate/shorter/punchier
  BrandProfileForm.tsx          Admin create/edit form, incl. "import from doc" flow

app/
  page.tsx                     Main generator UI
  admin/clients/*               Brand profile list/create/edit
  admin/page.tsx                 Usage & cost estimate dashboard
  login/page.tsx                 Google sign-in
  api/generate, api/refine       Core caption generation / single-variant refine
  api/clients*, api/brand-doc/parse   Brand profile CRUD + doc-to-profile extraction
  api/upload                     Vercel Blob client-upload token issuance
  api/cron/cleanup-blobs         Deletes Blob uploads older than 24h (see vercel.json)

proxy.ts                       Route protection (Next.js 16 renamed "middleware" to "proxy")
```

### Request flow (static/carousel/video are unified)

`UploadZone` looks at what was dropped: one image = static, several images =
carousel, one video = video. All three end up as an ordered list of small
JPEG data URLs (`CreativeAsset[]`) - carousel images resized to a 1568px
long edge client-side, video frames extracted client-side (6-8 frames via
hidden `<video>` + `<canvas>`, always including a ~0.5s "hook" frame). Only
these small JPEGs are ever sent to `/api/generate` - the original file never
touches a server function body. The original is optionally (best-effort)
uploaded straight to Vercel Blob from the browser for a 24h audit trail; if
Blob isn't configured, this silently no-ops and generation still works.

`/api/generate` builds a system prompt (`lib/prompts.ts`) from the platform
rules + either a loaded `BrandProfile` (Mode A) or an instruction to infer
tone from the creative (Mode B), calls Claude with the images, validates the
response against `generationResponseSchema` with zod, and retries once on a
parse/validation failure before returning a friendly error.

## Environment variables

See `.env.example` for the full list and what breaks if each is missing.
Only `ANTHROPIC_API_KEY` is required to run the core generation flow
locally - Blob, KV, and Auth all degrade gracefully when unset so you can
build/test incrementally (this is intentional, see `kvConfigured()` /
`isAuthConfigured()` checks throughout `lib/`).

## How to add a client (brand profile)

1. Go to `/admin/clients` -> "New client".
2. Either fill the fields by hand, or paste/upload the client's brand voice
   doc (PDF/DOCX/text) and click "Extract with Claude" - it fills the form
   for you to review and edit before saving. Nothing is saved until you
   click "Save profile".
3. The client then appears in the main generator's client dropdown, and
   their profile is injected into the system prompt (`lib/prompts.ts` ->
   `brandVoiceBlock()`) for every generation instead of the "infer the
   tone" instruction.

A profile can also be seeded from a generation: when no client is selected,
successful results show an "Inferred voice" note with a "Save inferred
voice as draft profile" button. This creates a profile with `isDraft: true`
(shown as "Draft" in the admin list) so someone reviews/fills it in properly
before it's treated as a real brand voice.

## How to update platform rules

Edit `config/platforms.ts` only - nothing else needs to change. Each entry
has `maxChars`, `visibleChars` (before feed truncation), `maxHashtags`, a
`styleGuidance` string injected into the prompt, and a `lastVerified` date.
**Re-verify against each platform's current help docs before changing
numbers** - these change over time and this file is the single source of
truth for both the prompt and the UI's over-limit warnings.

## Video: frames only (no audio) - this is intentional

The system prompt explicitly tells Claude it cannot hear the video and must
not guess at dialogue/voiceover. The "looks VO-heavy" nudge
(`lib/client/extractVideoFrames.ts`) is a cheap, non-ML heuristic based on
frame-to-frame pixel change (very high = fast cuts, very low = a static
locked-off shot like a talking head) - tune `FAST_CUT_THRESHOLD` /
`STATIC_SHOT_THRESHOLD` after looking at real client videos.

**Audio/video transcription is a planned future stage.** Do not build
hooks, config, or partial plumbing for it now - when it happens, it's a new
capability layered on top of the frame-based flow (e.g. an extra content
block with a transcript passed to the same `/api/generate` prompt builder),
not a rework of this stage.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in ANTHROPIC_API_KEY at minimum
npm run dev
```

See the stage-by-stage test notes given alongside this build for exactly
what to click through at each level of environment setup (API key only, +
KV, + Blob, + Google OAuth).

## Deploying to Vercel

1. **Import the repo**: [vercel.com/new](https://vercel.com/new) -> import
   `reactmarketinghub/caption0-agent`. It's a standard Next.js app, no build
   config changes needed.
2. **Provision storage** (Project -> Storage tab):
   - **Blob**: Create Database -> Blob. Copy the token into
     `BLOB_READ_WRITE_TOKEN`.
   - **KV**: Create Database -> Upstash Redis (Vercel KV itself is
     deprecated). Copy `KV_REST_API_URL` / `KV_REST_API_TOKEN` from its
     Quickstart tab.
3. **Set up Google OAuth** (Google Cloud Console -> APIs & Services ->
   Credentials -> OAuth client ID, type "Web application"):
   - Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback/google`
   - Copy the client ID/secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
   - Set `ALLOWED_EMAIL_DOMAIN` to your company's domain.
   - Generate `AUTH_SECRET` with `npx auth secret` (or `openssl rand -base64 32`).
4. **Set all env vars** from `.env.example` in Project Settings ->
   Environment Variables, plus `ANTHROPIC_API_KEY` and (optionally)
   `CRON_SECRET` (any random string - Vercel automatically sends it as the
   cron job's Bearer token once it's set).
5. **Deploy.** The Blob-cleanup cron in `vercel.json` runs automatically
   once deployed - no extra setup. Note it's scheduled once/day (not
   hourly) because Vercel's Hobby plan rejects more-frequent cron
   schedules; see the comment in `app/api/cron/cleanup-blobs/route.ts` if
   you're on Pro+ and want tighter cleanup.
6. Redeploy (or just push a commit) any time an env var changes - Vercel
   only picks up new env vars on the next build/deploy.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
