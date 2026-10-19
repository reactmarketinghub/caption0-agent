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
  blob.ts                     Resolves the Blob read-write token (handles a custom env-var-prefix connection, see "Custom Environment Variable Prefix gotcha" below)
  brandDocExtraction.ts       Shared file->text/image->Claude->structured-profile pipeline, used by both the manual "Import from files" flow and automatic brand-kit guideline extraction
  auth.ts                     Auth.js config + getCurrentUserEmail()
  extractDocText.ts           PDF/PPTX/DOCX/text -> plain text for the brand-doc-to-profile flow
  client/                     Browser-only helpers: image resize, video frame extraction, Blob upload

components/
  UploadZone.tsx               Single drop zone; classifies dropped files as static/carousel/video
  CarouselThumbnails.tsx       Drag-to-reorder carousel thumbnails (dnd-kit)
  CaptionGenerator.tsx          Main page orchestrator (client component)
  PostSettingsFields.tsx        Post format / objective controls (config/objectives.ts driven)
  PlatformCheckboxes.tsx        Network selection (Meta/TikTok/LinkedIn, config/platforms.ts driven) - see "Platform selection is network-level" below
  CaptionResults.tsx / CaptionVariantCard.tsx    Per-platform tabs, copy/regenerate/shorter/livelier
  BrandProfileForm.tsx          Admin create/edit form, incl. "import from doc" flow
  BrandKitSection.tsx           Brand kit uploads; auto-extracts guidelines from doc-type files into the profile

app/
  page.tsx                     Main generator UI
  admin/clients/*               Brand profile list/create/edit
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

Two **optional** controls sit next to the platform checkboxes, both driven
by `config/objectives.ts` (edit that file to add/reword options - no other
code changes needed) and both folded into the system prompt in
`buildSystemPrompt()`:

- **Post format** - `grid` (organic, will appear on the client's public
  feed - write it as an on-brand native post) vs `dark-post` (a paid ad that
  will never appear on the grid - fine to be more direct/CTA-forward).
- **Objective** - `traffic` (optimize for a click/visit, direct CTA) vs
  `awareness` (optimize for recall/affinity, no hard sell).

Both default to **"Not sure"** (`null` in the UI, `undefined` on the wire) -
neither is required. Left unset, `buildSystemPrompt()` swaps in an "infer
this from the creative" instruction instead of the fixed rule for that
control, same pattern as the no-brand-profile "infer the tone" fallback.
`getEffectiveCharLimit()` treats an unset post format the same as `grid`
(the platform's organic/hard-cap number) for character-limit purposes,
since we can't know which network's tighter dark-post limit would apply
without a chosen format - this is the conservative choice, not a guess at
intent.

## Server component pages reading live KV data must opt out of static caching

Next.js prerenders a Server Component page at *build* time by default
unless something on it forces dynamic rendering - a dynamic route segment
like `[id]` does this automatically, but a plain route like `/admin/clients`
does not just because it happens to `await` a KV call. Without
`export const dynamic = "force-dynamic"`, `/admin/clients` and `/admin`
were being frozen as static HTML at whatever `listBrandProfiles()` /
`buildUsageReport()` returned during `next build` - on Vercel that's
usually an empty/stale snapshot from before any real data existed, and it
never updates on its own after that, even though every client-side fetch
(e.g. `ClientSelector`'s `fetch("/api/clients")`, since API routes are
dynamic by default) correctly showed live data. This is exactly why a
newly-saved client could appear in the main generator's client dropdown
but never show up on `/admin/clients` - the page itself was stuck showing
build time forever, not actually broken data. Both pages now have
`export const dynamic = "force-dynamic"`. Any new Server Component page
added under `app/` that reads `lib/kv.ts` (or anything else that changes at
runtime) needs the same line - `next build`'s route list (`○` static vs
`ƒ` dynamic) is the way to catch this before it ships again.

## Environment variables

See `.env.example` for the full list and what breaks if each is missing.
Only `ANTHROPIC_API_KEY` is required to run the core generation flow
locally - Blob, KV, and Auth all degrade gracefully when unset so you can
build/test incrementally (this is intentional, see `kvConfigured()` /
`isAuthConfigured()` checks throughout `lib/`).

**Custom Environment Variable Prefix gotcha.** Vercel's "Connect Project"
flow for a Marketplace store (Blob or Upstash Redis) can apply a custom
prefix - connecting a store named e.g. "ClientTab" this way produces
`CLIENTTAB_BLOB_READ_WRITE_TOKEN` / `CLIENTTAB_KV_REST_API_URL` instead of
the bare names every SDK call and this app's own checks default to. The
dashboard will show the store as "Available" and correctly connected, so
this is easy to misdiagnose as "Blob/KV isn't configured" when it actually
is, just under a different env var name. `lib/blob.ts`'s
`resolveBlobToken()` and `lib/kv.ts`'s `resolveKvCredentials()` both scan
`process.env` for a `*_BLOB_READ_WRITE_TOKEN` / `*_KV_REST_API_URL` +
`*_KV_REST_API_TOKEN` pair as a fallback, so this should self-heal without
renaming anything in the Vercel dashboard - but every new `@vercel/blob`
call needs to go through `resolveBlobToken()` and pass `token` explicitly
(rather than trusting the SDK's own `process.env.BLOB_READ_WRITE_TOKEN`
default) for this to actually take effect. `/api/debug/env-check` reports
which exact env var name it found for both, if you need to confirm this on
a live deployment.

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

`BrandProfile` holds one brand-voice document's worth of structured fields
(tone, do's/don'ts, banned words, **keywords** - product names/taglines/
search-relevant terms Claude should weave in where natural, emoji rules,
CTA style, example captions) - not free-form file attachments. For
reference material you want the team to see but that isn't meant to shape
every generation (logos, fonts, full guideline PDFs for human reference),
use Brand kit files below instead.

Upload mechanics: files go straight from the browser to Vercel Blob under
`uploads/brand-doc/...` (bypassing the ~4.5MB serverless body cap the same
way creative uploads do - see `lib/client/uploadBrandDocFile.ts`), then
`/api/brand-doc/parse` fetches each one server-side, extracts text
(PDF/PPTX/DOCX/TXT via `lib/extractDocText.ts`) or passes images straight to
Claude's vision, and returns one merged profile. These blobs share the
`uploads/` prefix with ephemeral creatives, so the same 24h cleanup cron
sweeps them - no separate cleanup needed.

**A PDF with no text layer falls back to rendering its pages as images.**
`extractTextFromFile()` in `lib/extractDocText.ts` uses `pdf-parse`'s
`getText()`, which only reads a PDF's embedded text layer - a scanned brand
deck, or a "compressed"/flattened export where a compression tool rasterized
every page into one embedded image (a common way those tools shrink file
size, and a common real-world way a legit brand guidelines PDF ends up with
zero extractable text), has nothing for it to read. When that happens,
`renderPdfPagesAsImages()` (same file) renders up to the first
`MAX_PDF_SCREENSHOT_PAGES` (8) pages via `pdf-parse`'s
`getScreenshot()` instead, and those get pushed into the same `images` array
real screenshot uploads already use (`@napi-rs/canvas`, which `pdf-parse`
already needs, is now also an explicit dependency). **Caveat for anyone touching this:**
`pdf-parse`'s `getText()` has a parameter-mutation quirk where, unless you
explicitly pass `pageJoiner: ""`, it silently injects a
`"-- page N of M --"` marker into every page's text - including a
completely blank one - so `result.text.trim()` is never actually empty and
this fallback would never fire. `extractTextFromFile()` already passes
`pageJoiner: ""` to avoid this; don't drop it if you touch that call.

**PDF parsing only works on Vercel because of `next.config.ts` - don't undo
it.** `pdf-parse` -> `pdfjs-dist` polyfills `DOMMatrix` at runtime via
`createRequire(import.meta.url)("@napi-rs/canvas")`. Bundled into a route
chunk (Next's default), that lookup resolves from inside the bundle and the
native canvas package - a dynamic require plus a platform-specific `.node`
binary - is never traced into the deployed function, so *every* PDF failed in
production with `DOMMatrix is not defined` while working locally (where
`node_modules` sits right there). `serverExternalPackages` keeps `pdf-parse`,
`pdfjs-dist` and `@napi-rs/canvas` as plain `node_modules` requires, and
`outputFileTracingIncludes` ships them (including the `linux-x64-gnu` binary
Vercel runs on) with exactly the two PDF-parsing routes
(`/api/brand-doc/parse`, `/api/clients/[id]/brand-kit`) and no others.

**This is guarded automatically.** `npm run build` is
`next build && node scripts/check-pdf-trace.mjs`; that script reads each PDF
route's `.nft.json` trace and exits non-zero if the canvas package, its
native `.node` binary, `pdfjs-dist` or `pdf-parse` isn't shipped with it - so
a broken config fails the Vercel build (production keeps serving the previous
deployment) instead of failing for users at upload time. (Verified both ways:
passes on the real config, fails with exit 1 when `next.config.ts` is
emptied.) Needs Vercel's Build Command to be the default / `npm run build`,
not an override of plain `next build`. If you add another route that parses
PDFs, add it to `PDF_ROUTES` in `next.config.ts` **and** `ROUTES` in the
script. If a file still fails to read, the upload form shows the real
per-file reason and opens the paste-text box as a way forward (pasting never
touches PDF parsing).

**The "no readable text or images" error now says why, per file.** Before,
`extractBrandProfileFromFiles()` threw one generic
`"No readable text or images were found in those files."` whenever a batch
ended up empty, discarding whatever specific reason each file actually
failed for (a thrown extraction error, or - previously - a PDF silently
contributing nothing). A file that completes without throwing but still
contributes no text/images is now logged as its own per-file error with a
specific reason, and the batch-level error appends every file's actual
`name: reason` instead of staying generic - this is what actually explains
"why" to someone staring at a failed upload, instead of a dead end.

**Images sent to Claude are shrunk first - never send raw page renders.** A
photo-heavy campaign deck rendered as PNG came out ~10MB per page (~80MB for 8
pages in a test) against Claude's 5MB-per-image / ~32MB-per-request limits;
that was a major cause of repeat "We couldn't turn that into a profile"
failures and slow reads. `renderPdfPagesAsImages()` now renders at 1280px wide,
re-encodes as JPEG, and stops adding pages past a 12MB total budget (same deck:
80MB -> 3.7MB, half the time); `shrinkImageIfLarge()` downsizes any directly
uploaded image over 1.5MB to a 1568px JPEG. Both live in
`lib/extractDocText.ts`. `parseJsonLoose()` (`lib/claudeGenerate.ts`) also now
digs a JSON object out of prose/fenced replies, and when Claude's answer is
still unusable the thrown error includes the stop reason and the start of the
reply; `describeParseFailure()` shows that as "Technical detail: ..." so a
repeat failure can be diagnosed from the screen/Recent uploads log rather than
guessed at.

**The extraction result schema is intentionally lenient.** An import once
failed with the generic `"We couldn't turn that into a profile"` even though
the file was read fine: `brandDocParseResultSchema` was derived from the
strict profile schema, so a campaign deck with no tone of voice
(`toneOfVoice` min 1), a `null` list/text field, or more than 10 example
captions failed zod validation twice and threw. It's now its own lenient
schema in `lib/schemas.ts` (nulls/missing -> empty, captions trimmed to 10);
the admin fills gaps in the review step. Tone of voice is optional everywhere
(schema `.default("")`, form only requires a client name): when it's blank,
`brandVoiceBlock()` tells Claude to work the voice out from the do's, don'ts,
keywords and example captions instead. The
Claude step also uses `effort: "low"`, a time budget of what's left of the
route's 60s, and `describeParseFailure()` (`lib/brandDocExtraction.ts`) turns
timeouts / too-large / busy errors into specific messages that are also
written to the "Recent uploads" log - the generic message is only the last
resort. Don't derive extraction schemas from the strict save schemas.

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
fields (tone, emoji rules, CTA style) get filled in, list fields
(do's/don'ts/banned words/keywords/example captions) get unioned in, and
nothing a human already typed is overwritten. That merged profile is what
`brandVoiceBlock()` injects into every future generation for this client -
so uploading a client's brand guidelines toolkit here is enough to have
captions follow it going forward, for this or any other client. Everything
else (logos, fonts, arbitrary assets) is stored for the team's reference
only and is **never** sent to Claude - only recognized document types
trigger extraction.

## How to update platform rules

Edit `config/platforms.ts` only - nothing else needs to change. Each entry
has `maxChars`, `visibleChars` (before organic/grid feed truncation), a
`styleGuidance` string injected into the prompt, and a `lastVerified` date.
**Re-verify against each platform's current help docs before changing
numbers** - these change over time and this file is the single source of
truth for both the prompt and the UI's over-limit warnings.

`darkPostVisibleChars` is the same idea as `visibleChars` but for the ad
primary-text truncation point when Post format is set to "Dark post" -
`platformBlock()` in `lib/prompts.ts` picks whichever one matches the
selected post format. It's optional per platform; when unset (e.g.
LinkedIn currently), dark-post generations just fall back to the organic
`visibleChars` number. Currently verified: Meta (Instagram/Facebook) ads at
125 chars, TikTok ads at 100 chars.

`darkPostStyleNote` is extra style guidance appended only for a dark post
(any objective, traffic or awareness) - currently set on Instagram and
Facebook so Meta dark posts read a touch more developed/elaborated within
the tight character limit rather than maximally clipped ad-speak, while
also reinforcing that this should still be grounded in the client's brand
tone of voice/brand book precisely if one's on file. TikTok has no note
set, so its dark-post style is intentionally unchanged from before -
leave it unset for a platform whenever "make dark posts sound different"
shouldn't apply there.

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

**Platform selection is by network, with a per-platform choice inside it.**
`PlatformCheckboxes.tsx` iterates `ALL_NETWORKS` ("Meta", "TikTok", "LinkedIn")
via `NETWORK_PLATFORMS` in `config/platforms.ts`. Ticking "Meta" selects
Instagram and Facebook together by default, then shows an Instagram / Facebook
pair underneath so either one can be switched off (just Instagram, just
Facebook, or both); unticking both un-ticks Meta. A network with a single
platform (TikTok, LinkedIn) has no sub-choice. The component always hands back
platforms in canonical `ALL_PLATFORM_IDS` order so result tabs don't reshuffle.
A caption is generated per selected platform, each with its own style rules.

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

**Frame selection: as many frames as fit, with a few sharp key frames.** Extraction
(`lib/client/extractVideoFrames.ts`) is two passes. Pass 1 sweeps the whole video
once, one probe every `PROBE_INTERVAL_SEC` (0.75s) - between `MIN_PROBE_COUNT` (16)
and `MAX_PROBE_COUNT` (48) probes - and each probe records a tiny 24x24 grayscale
signature (the same `grayscaleSignature()`/`meanAbsDiff()` used for the VO-heavy
heuristic) *and* a small 640px JPEG (an "extra" frame). `pickSceneAwareTimestamps()`
then splits the probed range into `FRAME_COUNT - 1` equal-duration buckets (plus the
always-included ~0.5s hook) and each bucket contributes whichever of its probes
differs most from the one before it, so a real cut is captured precisely while a
static shot still gets even coverage. Pass 2 re-captures just those 7 key
timestamps at full 1568px so on-screen text stays legible. `mergeAndFit()` replaces
the extra taken at each key moment with the sharp key frame, sorts by time, and
if the set is over `MAX_TOTAL_DATAURL_CHARS` (3.6M) thins *extras only*, always
dropping the one whose neighbours are closest, so coverage stays even. That budget
exists because the frames travel in one JSON body to `/api/generate` and Vercel
rejects bodies over ~4.5MB. Result: a 24s clip sends ~34 frames (~2MB); busy long
footage keeps fewer extras but never loses key frames. More frames means more
input tokens per call (and generate makes one call per platform), so raise
`MAX_PROBE_COUNT` knowing it costs money and a little latency; the old
global-activity-ranking draft clustered picks early, which is why picks are
per-bucket. The UI deliberately shows only a spinner while this runs and one
preview image afterwards (no progress text, no frame strip). `/api/refine` sends
only 12 evenly spaced frames of a video (`thinFramesForRefine`) since a one-caption
rewrite doesn't need dozens; static and carousel creatives are untouched.

**Frames are labeled with their timestamp, not sent as a bare image stack.**
Each extracted frame already carried a `timestampSec` client-side
(`lib/client/extractVideoFrames.ts`), but it never reached Claude - frames
went to `/api/generate`/`/api/refine` as plain data URLs with no indication
of how much real time separated them. Claude would sometimes narrate a
false continuous sequence (e.g. treating a 0.5s hook frame and a frame from
20 seconds later as back-to-back action), which is the root cause behind
captions that "don't make sense" for a video. The fix: `videoFrameTimestamps`
now rides alongside `images` on both API requests (populated from
`CreativeAsset.timestampSec` in `CaptionGenerator.tsx`), and
`imagesWithVideoLabels()` in `lib/claudeGenerate.ts` turns each one into a
`"Frame N of M, captured at ~Ts into the video."` text block sent
immediately before that frame's image block (`generateStructured()`/
`imagesToBlocks()` now interleave text+image pairs instead of a flat image
array). `buildSystemPrompt()` also explicitly tells Claude these are sparse,
non-continuous samples and not to invent a transition/action connecting one
frame to the next - treat the set like one well-chosen photo, not a
flipbook. `/api/refine` previously dropped `videoLooksVoHeavy` entirely when
rebuilding the system prompt for a refine call; it's now forwarded too, so
refine's video guidance doesn't regress versus the original generation.

**Audio/video transcription is a planned future stage.** Do not build
hooks, config, or partial plumbing for it now - when it happens, it's a new
capability layered on top of the frame-based flow (e.g. an extra content
block with a transcript passed to the same `/api/generate` prompt builder),
not a rework of this stage.

## Creative variety and anti-repetition

Feedback from the team: the generator leaned on whatever permitted claim the
brand profile happened to mention (e.g. a "do" like "can claim
dermatologist-tested") in nearly every caption, for nearly every post. Three
things now work together against that:

1. **`CREATIVE_VARIETY_GUIDANCE` in `lib/prompts.ts`** states explicitly that
   a brand profile's `dos`/`keywords` are a menu, not a formula - "allowed to
   say X" does not mean "say X here" - and that the 3 variants for a platform
   must take genuinely different angle *types* (claim-led, emotional/story,
   curiosity/question, social-proof, playful/observational,
   behind-the-scenes), with a claim-led angle capped at one variant per
   platform, if any. `brandVoiceBlock()`'s `dos`/`keywords` lines carry the
   same "menu, not checklist" framing inline.
2. **Per-variant `angle` field + cross-generation memory.** Each caption
   variant now includes an internal-only `angle` field (`captionVariantSchema`
   in `lib/schemas.ts`, never shown in the UI) - a short label like "direct
   product claim" or "founder story hook". `/api/generate` logs every
   generation's angles to a per-client rolling history via
   `logCaptionAngles()`/`getRecentAngles()` in `lib/kv.ts` (capped at the last
   40 - roughly a dozen generations), and `buildSystemPrompt()`'s
   `recentAngles` tells Claude which angles this client's recent posts
   already used so it avoids repeating them. This is the actual "memory" -
   variety is enforced across sessions/days for a given client, not just
   within one generation's 3 variants. Mode B (no `clientId`) has no identity
   to key this on, so it's skipped there.
3. **Real web search, not just reasoning over what's already on file.**
   When there's no client profile, `/api/generate` passes `enableWebSearch: true` to `generateStructured()`
   (`lib/claudeGenerate.ts`), which binds Anthropic's server-side
   `web_search_20250305` tool (capped at `max_uses: 1` to bound latency/cost -
   it's a server tool, so the search and the final answer come back in one
   API response, no extra round trip needed on our end). `buildSystemPrompt()`'s
   `WEB_SEARCH_GUIDANCE` tells Claude to use it sparingly, only to confirm a
   specific current fact not already in the brand profile or to get a quick
   read on what's relevant right now - not as a routine step. Only
   `/api/generate`, and only when no client profile is selected, gets this tool
   (a profile already carries the brand facts and each search adds seconds),
   not `/api/refine`, which only tweaks one
   already-written caption and doesn't need fresh research).

Because Claude's response can now interleave narration/text blocks around
search tool calls, `extractText()` in `lib/claudeGenerate.ts` was changed to
read only the *last* text block instead of joining every text block - with no
tools involved (e.g. `/api/refine`, brand-doc extraction) this is identical
to the old behavior, since there's normally just one text block.

## Sounding human, compliance, and creative freedom

Three more pieces of standing guidance in `lib/prompts.ts`, added on top of
`HUMAN_VOICE_GUIDANCE` rather than replacing it (same "add to it" rule as
that block):

- **`HUMAN_VOICE_GUIDANCE` gained two more bullets**: use contractions and
  let a line run a little informal rather than grammatically tidy, and don't
  force a neat closing thought just to wrap up a caption - real captions are
  allowed to just end.
- **`BRAND_COMPLIANCE_GUIDANCE`** (only added to the prompt when a
  `BrandProfile` is actually loaded - there's nothing for it to reference in
  Mode B) states explicitly that the profile's `donts` and `bannedWords` are
  hard, zero-exception constraints that come before cleverness, that
  compliance is a floor rather than a script (full creative freedom in
  framing/structure/wording *within* those constraints, driven by what's
  actually in the specific creative, not a reusable template), and that
  Claude should actually ground captions in the real tone/do's/keywords/
  example captions it was given rather than writing something generic that
  merely avoids the don'ts. `brandVoiceBlock()`'s own `donts`/`bannedWords`
  lines were reworded the same way ("hard constraints," "must NEVER appear,
  no exceptions, not even inside a negation or a joke").
- **`bannedWords` is now actually enforced, not just requested.** The
  `donts` list is free-form behavioral guidance no string check can verify,
  but `bannedWords` is a literal word/phrase list - mechanically checkable,
  the same way a character limit is. `validateBannedWords()` in
  `lib/generationValidation.ts` does a case-insensitive substring check
  against each caption and plugs into the exact same `generateStructured()`
  retry-with-a-corrective-instruction mechanism `validateCaptionLength()`
  already used for character limits; `validateGenerationResponse()` now
  takes a `bannedWords` array and checks both per variant, and
  `combineViolations()` merges multiple simultaneous violations (e.g. over
  length *and* a banned word) into one retry instruction instead of only
  surfacing the first one found. Both `/api/generate` and `/api/refine` pass
  `profile?.bannedWords` through.

### Punctuation mix: at least one "!" per platform (unless the client forbids it)

Every caption in a set ended on a full stop, which read flat. For a client with no
exclamation rule (or no client), `EXCLAMATION_GUIDANCE` (`lib/prompts.ts`) tells Claude
at least one of the 3 variants per platform must use a "!" (never "!!", not on a
serious-toned caption), and `validateExclamationMix()` (`lib/generationValidation.ts`)
enforces it through the same retry-with-a-corrective-instruction path as length and
banned words. If the client's profile rules out exclamation marks - `allowsExclamation()`
reads their don'ts / emoji rules / CTA style / banned words for "exclamation ..." or a "!"
next to a negation like no/never/avoid/don't - the logic flips: `NO_EXCLAMATION_GUIDANCE`
goes in the prompt and `validateNoExclamation()` retries any caption containing a "!"
(also on the `/api/refine` buttons, so Livelier can't sneak one in). The brand's rules
always beat the house style; a false-positive match errs on the side of no "!". When
adding to this, keep `generate` and `refine` in step (`exclamation: "require" | "forbid"`).

### Refine buttons: Livelier options

A caption card offers Copy / Regenerate / Shorter / **Livelier**. Livelier opens
an inline row of options (More playful, More energetic, More chatty, Funnier,
Bolder) defined in `config/refinements.ts` - edit that file to reword or add
one (add the id to `LIVELIER_IDS` and an entry in `LIVELIER_OPTIONS`; the
refine schema, route and card all read from it). Each option sends its id as
the `/api/refine` `instruction`; the old single "Punchier" button is gone.

### Concrete anti-ad-copy rules (added after "still sounds weird" feedback)

Abstract instructions ("don't sound like AI") weren't enough: captions still
opened with rhetorical questions, shared one `Prime Day deals are live...
Shop now on Amazon` skeleton, and used stock lines ("calling your name",
"just got an upgrade"). `buildSystemPrompt()` now also appends
`AD_COPY_CLICHES` (named patterns to avoid, at most one question opener per
platform) and `VOICE_TEXTURE_GUIDANCE` (name something specific seen in the
creative, deliberately different lengths across variants, a differently
worded CTA per variant, a reread-and-rewrite self-check, one good/bad
example pair). The "traffic" objective text in `config/objectives.ts` also
no longer asks for a direct "shop now" ask in every caption - that wording
was pushing all three variants to the same ending. Add to these lists when
new stock phrasing shows up; don't remove them. Not yet validated against
live output - check real generations after deploy.

## Generation must finish inside Vercel's 60s limit, and fail as JSON

A live generation once showed `Unexpected token 'A', "An error o"... is not
valid JSON`: Vercel kills a function that runs past `maxDuration` (60s) and
replies with a plain-text error page, which the browser then fed to
`res.json()`. Three layers now guard against that:

- **`lib/client/readApiJson.ts`** replaces every `res.json()` in the
  components. It reads the body as text and, if it isn't JSON, throws a
  plain-language message chosen by HTTP status. Use it for any new fetch to
  our own API routes.
- **A soft time budget in `generateStructured()`** (`lib/claudeGenerate.ts`,
  `DEFAULT_TIME_BUDGET_MS` = 50s). Each attempt gets an `AbortSignal` for the
  time left, and a retry (invalid JSON / failed validation) only starts if at
  least `MIN_RETRY_MS` remains. Otherwise it throws `GenerationTimeoutError`,
  which `/api/generate` and `/api/refine` turn into a clean JSON 504.
- **Lower latency**: `GENERATION_EFFORT = "medium"` and
  `MAX_OUTPUT_TOKENS = 8192` in `lib/anthropic.ts` (Sonnet 5's default effort
  is "high"; adaptive thinking also counts toward `max_tokens`, so a tight cap
  truncated the JSON and forced a second full attempt), and web search is
  capped at `max_uses: 1` (and skipped entirely when a client profile is selected). Raise effort / searches back if captions look thin
  and the time budget allows, or raise `maxDuration` if the Vercel plan does.

Each attempt logs one JSON line (`evt`, `attempt`, `elapsedMs`, `stopReason`,
`outputTokens`, `webSearches`) to the Vercel function logs - check those first
when generation is slow or failing.

## "401 invalid x-api-key" is a server setting, not a code bug

Uploads/generation once failed everywhere with `401 authentication_error:
invalid x-api-key` (surfaced via the "Technical detail" text). That means the
`ANTHROPIC_API_KEY` env var on Vercel is wrong, revoked, or was pasted badly -
no code change fixes it; an admin has to set a valid key in Vercel (Settings >
Environment Variables, applied to Production AND Preview) and redeploy (env
vars only apply to new deployments). The code now helps: `cleanApiKey()`
(`lib/anthropic.ts`) strips whitespace/quotes/a pasted `ANTHROPIC_API_KEY=`
prefix, `isApiKeyProblem()` + `API_KEY_PROBLEM_MESSAGE` turn a 401/403 into a
plain "ask an admin to update the key" message on generate, refine and
brand-doc import, and `/api/debug/env-check` reports whether the key looks
right (`sk-ant-` prefix, stray whitespace/quotes) without revealing it.

### Generation runs one request per platform, in parallel

`/api/generate` used to ask Claude for every selected platform's captions in
one request, so the time added up (Instagram + Facebook + TikTok + LinkedIn
written one after another, plus any web search) and runs could hit the
50s/60s limit ("taking too long"). It now fires one `generateStructured()`
call per selected platform with `Promise.allSettled`, each with
`buildSystemPrompt({ platforms: [platform] })`, and merges the results in the
requested platform order (`inferred_voice` is the first non-empty one; usage is
summed; any platform failing fails the whole request with the same friendly
errors). Wall-clock is about the slowest single platform instead of the sum
(verified with a stubbed API: 4 platforms x 4s -> ~5s total vs ~16s).
Trade-off: the creative's images are sent once per platform call (more input
tokens), and platforms are written independently, so there's no
cross-platform coordination beyond the shared brand profile and recent-angles
list. Web search is off when a client profile exists and capped at one search
otherwise.

## Every Vercel deployment keeps its own permanent URL

An "it's still broken" report turned out to be an old preview link
(`caption0-agent-<hash>-<team>.vercel.app`): each deployment is immutable, so
that URL serves the code from when it was built, forever, no matter what was
pushed since. Only the Production Branch's deploys update the main domain;
every other branch builds as a Preview with its own URL. `AppHeader` shows a
small `v <sha> · production|preview` label (from `VERCEL_GIT_COMMIT_SHA` /
`VERCEL_ENV`, hidden locally) so anyone can see which build they're on - when
debugging a "still broken" report, compare that sha to `git log` first.

## Hashtags are not generated - this is intentional, by request

At the team's request, this app does not generate or display hashtags
anywhere, period - not as a per-generation option, just removed outright.
`captionVariantSchema` in `lib/schemas.ts` no longer has a `hashtags` field,
`buildSystemPrompt()` appends a standing `NO_HASHTAGS_GUIDANCE` instruction
telling Claude not to include any, and `PlatformRules` in
`config/platforms.ts` no longer carries a `maxHashtags` number (each
platform's `styleGuidance` had its hashtag-count advice removed too). The
brand profile's old `hashtagRules` free-text field is gone the same way -
from the schema, the admin form, and brand-doc extraction - since there's
nothing left for it to configure. If hashtags come back later as a
deliberate, user-controlled feature (not just "always on" like before),
treat that as new scope - re-add a schema field and UI control rather than
assuming the old `hashtagRules`/`maxHashtags` shape is still the right one.

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
