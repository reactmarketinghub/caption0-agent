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
config/platforms.ts          Per-platform limits/style rules + network grouping (edit freely, no code changes needed elsewhere)
config/objectives.ts         Post format (grid/dark-post) + objective (traffic/awareness) rules (same edit-freely pattern)

lib/
  anthropic.ts                Anthropic client + CLAUDE_MODEL constant (bump this one line to upgrade models)
  claudeGenerate.ts           generateStructured(): calls Claude, parses/validates JSON with zod, retries once on invalid JSON or a failed `validate` check
  generationValidation.ts     Post-generation character-limit checks passed to generateStructured() as `validate`
  prompts.ts                  System prompt builders (Mode A/B, post format/objective, video no-audio disclaimer, brand-doc parsing)
  schemas.ts                  zod schemas: BrandProfile, GenerationResponse, API request bodies
  kv.ts                       Vercel KV wrapper: brand profiles, rate limiting, generation/upload logs
  brandDocExtraction.ts       Shared file->text/image->Claude->structured-profile pipeline, used by both the manual "Import from files" flow and automatic brand-kit guideline extraction
  auth.ts                     Auth.js config + getCurrentUserEmail()
  usage.ts                    Token -> USD cost estimate + usage report aggregation
  extractDocText.ts           PDF/PPTX/DOCX/text -> plain text for the brand-doc-to-profile flow
  client/                     Browser-only helpers: image resize, video frame extraction, Blob upload

components/
  UploadZone.tsx               Single drop zone; classifies dropped files as static/carousel/video
  CarouselThumbnails.tsx       Drag-to-reorder carousel thumbnails (dnd-kit)
  CaptionGenerator.tsx          Main page orchestrator (client component)
  PostSettingsFields.tsx        Post format / objective controls (config/objectives.ts driven)
  PlatformCheckboxes.tsx        Network selection (Meta/TikTok/LinkedIn, config/platforms.ts driven) - see "Platform selection is network-level" below
  CaptionResults.tsx / CaptionVariantCard.tsx    Per-platform tabs, copy/regenerate/shorter/punchier
  BrandProfileForm.tsx          Admin create/edit form, incl. "import from doc" flow
  BrandKitSection.tsx           Brand kit uploads; auto-extracts guidelines from doc-type files into the profile

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
tone from the creative (Mode B) + the post format and objective (see below),
calls Claude with the images, validates the response against
`generationResponseSchema` with zod, and retries once on a parse/validation
failure before returning a friendly error.

There is intentionally no manual "brief" field anywhere in this flow - the
whole point of this tool is to minimize manual input, so Claude infers the
key message/CTA entirely from the creative, the brand profile, and the
post-format/objective controls below.

Every generation also carries a standing `HUMAN_VOICE_GUIDANCE` block in
`lib/prompts.ts` telling Claude to avoid stock AI-sounding phrasing
("elevate," "unlock," "game-changer," forced rule-of-three lists, em-dash
tics, etc.) and to vary rhythm across the 3 variants instead of running the
same template with different words. Keep this block intact (add to it
rather than removing it) when touching `buildSystemPrompt()` - this is a
standing requirement, not a one-off tweak.

### Post format & objective

Two required controls sit next to the platform checkboxes, both driven by
`config/objectives.ts` (edit that file to add/reword options - no other code
changes needed) and both folded into the system prompt in
`buildSystemPrompt()`:

- **Post format** - `grid` (organic, will appear on the client's public
  feed - write it as an on-brand native post) vs `dark-post` (a paid ad that
  will never appear on the grid - fine to be more direct/CTA-forward).
- **Objective** - `traffic` (optimize for a click/visit, direct CTA) vs
  `awareness` (optimize for recall/affinity, no hard sell).

## Environment variables

See `.env.example` for the full list and what breaks if each is missing.
Only `ANTHROPIC_API_KEY` is required to run the core generation flow
locally - Blob, KV, and Auth all degrade gracefully when unset so you can
build/test incrementally (this is intentional, see `kvConfigured()` /
`isAuthConfigured()` checks throughout `lib/`).

## How to add a client (brand profile)

1. Go to `/admin/clients` -> "New client".
2. Either fill the fields by hand, or drag in the client's brand material -
   any mix of PDFs, PPTX/DOCX decks, plain text, or screenshots, one file or
   many at once - and Claude extracts a profile automatically. Each file
   shows live in an upload log (uploading -> extracting -> done/error) so
   it's obvious what got read. The extracted fields land in a collapsed
   "Profile details" section (auto-expanded once something is extracted) to
   review and edit before saving. Nothing is saved until you click "Save
   profile".
3. The client then appears in the main generator's client dropdown, and
   their profile is injected into the system prompt (`lib/prompts.ts` ->
   `brandVoiceBlock()`) for every generation instead of the "infer the
   tone" instruction.

Upload mechanics: files go straight from the browser to Vercel Blob under
`uploads/brand-doc/...` (bypassing the ~4.5MB serverless body cap the same
way creative uploads do - see `lib/client/uploadBrandDocFile.ts`), then
`/api/brand-doc/parse` fetches each one server-side, extracts text
(PDF/PPTX/DOCX/TXT via `lib/extractDocText.ts`) or passes images straight to
Claude's vision, and returns one merged profile. These blobs share the
`uploads/` prefix with ephemeral creatives, so the same 24h cleanup cron
sweeps them - no separate cleanup needed.

Every file's read/extract outcome (success or error, filename, timestamp,
who uploaded it, and the client name typed in the form at the time, if any)
is persisted to KV via `logBrandDocUpload()`/`listBrandDocLogs()` in
`lib/kv.ts` and shown as a "Recent uploads" feed at the top of
`/admin/clients` - this is a team-wide activity log, not tied to any one
browser session, so an upload attempt is visible there even if the New
client form was never saved.

A profile can also be seeded from a generation: when no client is selected,
successful results show an "Inferred voice" note with a "Save inferred
voice as draft profile" button. This creates a profile with `isDraft: true`
(shown as "Draft" in the admin list) so someone reviews/fills it in properly
before it's treated as a real brand voice.

### Brand kit files

Once a client is saved, its edit page (`/admin/clients/[id]`) shows a
**Brand kit** section for uploading reference files (logos, guideline docs,
fonts - any file type). These are stored persistently in Vercel Blob under
`brand-kits/{clientId}/...` (a different prefix than the ephemeral
`uploads/...` creatives, so the 24h cleanup cron never touches them). A new
(unsaved) client has no id yet, so this section only appears once the
profile has been created at least once.

**Guideline decks are used, not just stored.** When an uploaded brand kit
file is a PDF/PPTX/DOCX/TXT (checked via `isAutoExtractableDoc()` in
`lib/brandDocExtraction.ts`), the POST handler in
`/api/clients/[id]/brand-kit` automatically runs it through the same
extraction pipeline as the "Import from files" flow and merges the result
into the profile with `mergeExtractedIntoProfile()` - blank single-value
fields (tone, emoji/hashtag rules, CTA style) get filled in, list fields
(do's/don'ts/banned words/example captions) get unioned in, and nothing a
human already typed is overwritten. That merged profile is what
`brandVoiceBlock()` injects into every future generation for this client -
so uploading a client's brand guidelines toolkit here is enough to have
captions follow it going forward, for this or any other client. Everything
else (logos, fonts, arbitrary assets) is stored for the team's reference
only and is **never** sent to Claude - only recognized document types
trigger extraction.

## How to update platform rules

Edit `config/platforms.ts` only - nothing else needs to change. Each entry
has `maxChars`, `visibleChars` (before organic/grid feed truncation),
`maxHashtags`, a `styleGuidance` string injected into the prompt, and a
`lastVerified` date. **Re-verify against each platform's current help docs
before changing numbers** - these change over time and this file is the
single source of truth for both the prompt and the UI's over-limit warnings.

`darkPostVisibleChars` is the same idea as `visibleChars` but for the ad
primary-text truncation point when Post format is set to "Dark post" -
`platformBlock()` in `lib/prompts.ts` picks whichever one matches the
selected post format. It's optional per platform; when unset (e.g.
LinkedIn currently), dark-post generations just fall back to the organic
`visibleChars` number. Currently verified: Meta (Instagram/Facebook) ads at
125 chars, TikTok ads at 100 chars.

`network` labels which ad network's dark-post limits a platform shares
(Instagram and Facebook both run under `"Meta"`) - `CaptionVariantCard`
shows it as a small badge on every result so it's clear at a glance which
limit applies, and its "over limit" red-flagging in the UI switches from
the platform's hard `maxChars` (grid posts) to `darkPostVisibleChars` (dark
posts) accordingly - a dark-post caption that's fine under the platform's
technical cap but blows past the ad's visible-text truncation still needs
to show red, since that's the number that actually matters for an ad.
`getEffectiveCharLimit(rules, postFormat)` in `config/platforms.ts` is the
one place that decides which number is "the" limit for a given
platform/format pair - the UI, the prompt, and the post-generation
validation below all call through it rather than each re-deriving it.

**Platform selection is network-level, not per-platform.** The checkboxes
in `PlatformCheckboxes.tsx` iterate `ALL_NETWORKS` ("Meta", "TikTok",
"LinkedIn") via `NETWORK_PLATFORMS` in `config/platforms.ts`, not
`ALL_PLATFORM_IDS` - checking "Meta" always selects Instagram *and*
Facebook together (you can't pick one without the other), since that's how
ad ops actually thinks about a Meta post. A caption is still generated per
individual platform under the hood (each with its own hashtag/style rules),
this only changes the selection granularity in the UI.

**Character limits are enforced, not just displayed.** `lib/
generationValidation.ts` (`validateGenerationResponse` for `/api/generate`,
`validateCaptionLength` for `/api/refine`) is passed as the `validate`
callback to `generateStructured()` (`lib/claudeGenerate.ts`), which now
supports retrying once with a corrective, violation-specific instruction
when a business rule fails - not just on invalid JSON like before. A
caption over its `getEffectiveCharLimit()` triggers exactly this: one
retry telling Claude specifically which platform/variant was over and by
how much, asking for the *entire* caption (not just the hook) to fit. If
it's still over after that retry, the result is returned anyway rather
than failing the whole generation - the UI's red flag is the last-resort
signal, the retry is the first line of defense. `buildSystemPrompt()` also
states dark-post limits as a hard requirement up front (not framed as a
soft "visible before truncation" preview window like grid posts get),
since a dark post has no "see more" to fall back on.

## Video: frames only (no audio) - this is intentional

The system prompt explicitly tells Claude it cannot hear the video and must
not guess at dialogue/voiceover. The "looks VO-heavy" flag
(`lib/client/extractVideoFrames.ts`) is a cheap, non-ML heuristic based on
frame-to-frame pixel change (very high = fast cuts, very low = a static
locked-off shot like a talking head) - when it fires, `buildSystemPrompt()`
adds an extra instruction to lean even harder on on-screen text and stay
conservative, since it's flagged there but not surfaced as a manual
brief-me nudge (there's no brief field). Tune `FAST_CUT_THRESHOLD` /
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
