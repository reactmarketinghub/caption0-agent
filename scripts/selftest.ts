/**
 * Self-test for the app's logic - no network, no API key needed. Run with
 * `npm run selftest` (also part of `npm run check`). Each test guards a rule
 * the team asked for or a bug that has actually shipped once; if one fails,
 * read its name first - it says what broke.
 */
import assert from "node:assert/strict";
import {
  allowsExclamation,
  validateBannedWords,
  validateCaptionLength,
  validateExclamationMix,
  validateGenerationResponse,
  validateNoExclamation,
} from "../lib/generationValidation";
import { parseJsonLoose } from "../lib/claudeGenerate";
import {
  brandDocParseResultSchema,
  brandProfileInputSchema,
  refineRequestSchema,
  type BrandProfile,
  type GenerationResponse,
} from "../lib/schemas";
import { buildSystemPrompt } from "../lib/prompts";
import { cleanApiKey, isApiKeyProblem } from "../lib/anthropic";
import { mediaTypeFromDataUrl } from "../lib/client/creativeAsset";
import { friendlyStatusMessage } from "../lib/client/readApiJson";
import { mergeAndFit } from "../lib/client/extractVideoFrames";
import { shrinkImageIfLarge } from "../lib/extractDocText";
import { TONE_IDS, TONE_OPTIONS } from "../config/refinements";
import { ALL_NETWORKS, NETWORK_PLATFORMS, PLATFORM_RULES, getEffectiveCharLimit } from "../config/platforms";

type Test = { name: string; run: () => void | Promise<void> };
const tests: Test[] = [];
const test = (name: string, run: Test["run"]) => tests.push({ name, run });

const profile = (over: Partial<BrandProfile> = {}): BrandProfile => ({
  id: "1", clientName: "Test", toneOfVoice: "Warm", dos: [], donts: [], bannedWords: [], keywords: [],
  emojiRules: "", ctaStyle: "", exampleCaptions: [], isDraft: false, brandKitFiles: [], createdAt: "", updatedAt: "", ...over,
});
const response = (platform: GenerationResponse["platforms"][number]["platform"], captions: string[]): GenerationResponse => ({
  platforms: [{ platform, variants: captions.map((c) => ({ caption: c, char_count: c.length })) }],
});

// --- exclamation rule -------------------------------------------------------
test("exclamation: allowed with no profile / a plain profile", () => {
  assert.equal(allowsExclamation(null), true);
  assert.equal(allowsExclamation(profile()), true);
  assert.equal(allowsExclamation(profile({ donts: ["Never mention competitors"] })), true);
});
test("exclamation: forbidden by every common wording of the rule", () => {
  for (const donts of [["No exclamation marks"], ["Do not use exclamation points"], ["Avoid exclamations"], ["Never use \"!\""], ["no !"]]) {
    assert.equal(allowsExclamation(profile({ donts })), false, donts[0]);
  }
  assert.equal(allowsExclamation(profile({ emojiRules: "Avoid ! and emoji" })), false);
});
test("exclamation: a set with no '!' is rejected, one '!' passes, rule can be off", () => {
  assert.ok(validateExclamationMix(response("instagram", ["a.", "b.", "c."])));
  assert.equal(validateExclamationMix(response("instagram", ["a.", "b!", "c."])), null);
  assert.equal(validateGenerationResponse(response("instagram", ["a.", "b.", "c."]), undefined, [], { exclamation: "ignore" }), null);
  assert.ok(validateGenerationResponse(response("instagram", ["a.", "b.", "c."]), undefined, [], { exclamation: "require" }));
});
test("exclamation: forbid mode rejects any '!'", () => {
  assert.ok(validateNoExclamation({ caption: "Nice!", char_count: 5 }));
  assert.equal(validateNoExclamation({ caption: "Nice.", char_count: 5 }), null);
  assert.ok(validateGenerationResponse(response("tiktok", ["x!", "y.", "z."]), undefined, [], { exclamation: "forbid" }));
});

// --- hard limits ---------------------------------------------------------------
test("limits: dark-post Meta ads use the 125-char ad limit, grid uses the platform cap", () => {
  assert.equal(getEffectiveCharLimit(PLATFORM_RULES.instagram, "dark-post"), 125);
  assert.equal(getEffectiveCharLimit(PLATFORM_RULES.instagram, "grid"), PLATFORM_RULES.instagram.maxChars);
  assert.equal(getEffectiveCharLimit(PLATFORM_RULES.instagram, undefined), PLATFORM_RULES.instagram.maxChars);
  assert.ok(validateCaptionLength("instagram", "dark-post", { caption: "x", char_count: 126 }));
  assert.equal(validateCaptionLength("instagram", "dark-post", { caption: "x", char_count: 125 }), null);
});
test("banned words: case-insensitive, even inside a negation", () => {
  assert.ok(validateBannedWords(["cheap"], { caption: "Not CHEAP at all", char_count: 16 }));
  assert.equal(validateBannedWords(["cheap"], { caption: "Great value", char_count: 11 }), null);
  assert.equal(validateBannedWords([], { caption: "anything", char_count: 8 }), null);
});

// --- reading Claude's replies --------------------------------------------------
test("parseJsonLoose: clean, fenced and prose-wrapped JSON; throws on none", () => {
  assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Here you go: {"a":1} Hope that helps.'), { a: 1 });
  assert.throws(() => parseJsonLoose("I could not find any guidelines."));
});

// --- schemas -------------------------------------------------------------------
test("brand-doc extraction schema is lenient (empty tone, nulls, >10 captions)", () => {
  const base = { toneOfVoice: "x", dos: [], donts: [], bannedWords: [], keywords: [], emojiRules: "", ctaStyle: "", exampleCaptions: [] };
  for (const patch of [{ toneOfVoice: "" }, { dos: null }, { emojiRules: null }, { keywords: undefined }, { exampleCaptions: Array(11).fill("a") }]) {
    const r = brandDocParseResultSchema.safeParse({ ...base, ...patch });
    assert.ok(r.success, JSON.stringify(patch));
    assert.ok(r.data.exampleCaptions.length <= 10);
  }
});
test("brand profile: only the client name is required (tone is optional)", () => {
  assert.ok(brandProfileInputSchema.safeParse({ clientName: "Hero" }).success);
  assert.ok(!brandProfileInputSchema.safeParse({ clientName: "" }).success);
});
test("refine accepts regenerate, shorter and every Tone option - and no longer 'punchier'", () => {
  const body = { platform: "instagram", creativeType: "static", images: ["x"], currentCaption: "c" };
  for (const instruction of ["regenerate", "shorter", ...TONE_IDS]) assert.ok(refineRequestSchema.safeParse({ ...body, instruction }).success, instruction);
  assert.ok(!refineRequestSchema.safeParse({ ...body, instruction: "punchier" }).success);
  for (const id of TONE_IDS) assert.ok(TONE_OPTIONS[id].label && TONE_OPTIONS[id].instruction, id);
});
test("platforms: Meta groups Instagram + Facebook; every platform belongs to exactly one network", () => {
  assert.deepEqual(NETWORK_PLATFORMS.Meta, ["instagram", "facebook"]);
  const all = ALL_NETWORKS.flatMap((n) => NETWORK_PLATFORMS[n]);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, Object.keys(PLATFORM_RULES).length);
});

// --- prompt guardrails ---------------------------------------------------------
test("prompt: standing guardrails are always present", () => {
  const p = buildSystemPrompt({ profile: null, platforms: ["instagram"], creativeType: "static" });
  for (const needle of ["hashtag", "AVOID", "Punctuation mix", "different people"]) {
    assert.ok(p.toLowerCase().includes(needle.toLowerCase()), `missing: ${needle}`);
  }
});
test("prompt: no '!' rule is added for a client who forbids it, and a blank tone is handled", () => {
  const banned = buildSystemPrompt({ profile: profile({ donts: ["No exclamation marks"] }), platforms: ["instagram"], creativeType: "static" });
  assert.ok(banned.includes("rule out exclamation marks"));
  assert.ok(!banned.includes("Punctuation mix"));
  const blank = buildSystemPrompt({ profile: profile({ toneOfVoice: "" }), platforms: ["instagram"], creativeType: "static" });
  assert.ok(blank.includes("Tone of voice: not stated"));
  assert.ok(blank.includes("Compliance comes before cleverness"));
});
test("prompt: web search guidance only when search is enabled", () => {
  assert.ok(buildSystemPrompt({ profile: null, platforms: ["tiktok"], creativeType: "static", webSearchEnabled: true }).includes("web_search"));
  assert.ok(!buildSystemPrompt({ profile: null, platforms: ["tiktok"], creativeType: "static" }).includes("web_search"));
});

// --- API key + client helpers --------------------------------------------------
test("api key: stray whitespace, quotes and a pasted name= prefix are stripped", () => {
  for (const raw of ["sk-ant-abc\n", "  sk-ant-abc ", '"sk-ant-abc"', "ANTHROPIC_API_KEY=sk-ant-abc"]) assert.equal(cleanApiKey(raw), "sk-ant-abc", raw);
  assert.equal(cleanApiKey(undefined), "");
  assert.ok(isApiKeyProblem({ status: 401 }) && isApiKeyProblem({ status: 403 }) && !isApiKeyProblem({ status: 500 }));
});
test("readApiJson: friendly message for a timeout vs a server error", () => {
  assert.match(friendlyStatusMessage(504), /too long/i);
  assert.match(friendlyStatusMessage(500), /server/i);
});

// --- video frames --------------------------------------------------------------
test("video frames: over budget thins extras only, keeps every key frame, stays sorted", () => {
  const mk = (t: number, n: number) => ({ dataUrl: "x".repeat(n), timestampSec: t });
  const keys = [0.5, 4, 9, 14, 19, 24, 29].map((t) => mk(t, 400_000));
  const extras = Array.from({ length: 48 }, (_, i) => mk(0.7 + i * 0.6, 60_000));
  const out = mergeAndFit(keys, extras);
  assert.ok(out.reduce((n, f) => n + f.dataUrl.length, 0) <= 3_600_000);
  assert.ok(keys.every((k) => out.includes(k)));
  assert.ok(out.every((f, i) => i === 0 || f.timestampSec >= out[i - 1].timestampSec));
  assert.equal(mergeAndFit([mk(0.5, 1000)], [mk(1, 1000), mk(2, 1000)]).length, 3);
});
test("images: the declared type follows the data URL (a PNG is never labelled JPEG)", () => {
  assert.equal(mediaTypeFromDataUrl("data:image/png;base64,AAAA"), "image/png");
  assert.equal(mediaTypeFromDataUrl("data:image/jpeg;base64,AAAA"), "image/jpeg");
  assert.equal(mediaTypeFromDataUrl("data:image/webp;base64,AAAA"), "image/webp");
  assert.equal(mediaTypeFromDataUrl("data:image/gif;base64,AAAA"), "image/gif");
  assert.equal(mediaTypeFromDataUrl("not-a-data-url"), "image/jpeg");
});
test("images: small uploads pass through untouched", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const r = await shrinkImageIfLarge(png, "image/png");
  assert.equal(r.mediaType, "image/png");
});

// --- runner --------------------------------------------------------------------
(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.run();
      console.log(`  ok   ${t.name}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL ${t.name}\n       ${(err as Error).message.split("\n")[0]}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
