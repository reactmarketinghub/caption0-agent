// Live smoke test: pokes the deployed app the way a user would and checks it
// answers sensibly. Run with `npm run smoke` (BASE_URL overrides the target).
// It makes two tiny real Claude calls (one text-only brand import, one
// one-platform caption generation on a tiny image), so it costs a fraction of a
// cent - and it proves the API key, the JSON pipeline and generation all work
// on the real deployment, which the offline selftest can't.
//
// Exit code 1 if anything fails. Failures caused by deployment settings (a
// rejected API key, login required) are labelled as such - they need a person
// in Vercel, not a code change.
const BASE = (process.env.BASE_URL ?? "https://caption0-agent.vercel.app").replace(/\/$/, "");
// A tiny real JPEG - the same format the app always sends.
const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABgAGADASIAAhEBAxEB/8QAGgABAQEBAQEBAAAAAAAAAAAAAgAGBQMBBP/EACwQAQACAgECBAMJAQAAAAAAAAEAAgMEEQUSBhMhUTFBcRQVIiMlYYGRsaH/xAAXAQEBAQEAAAAAAAAAAAAAAAADAgQF/8QAHBEAAwEAAwEBAAAAAAAAAAAAAAECEQMSITEy/9oADAMBAAIRAxEAPwDLhGEgjCdOqM6RBEEgjCDVFpEEYSCMINUIkQRhIIggVQiRBGEgjCDVFpEEYSCMINUIkcMIgkEYTs1RgSIIwkEYQaoRIgjCQRBAqhEiCMJBGEGqLSIIwkEYQaoRIgiCQRhAqhEjhhGEgjCdqqMCRBGE9dOmK23hrneMTkqXeeOK8+s3nVtHrFclLdFzY8etSgVw14PX+Thgtl/DABGE6fXsmXP1PnPqOtlKVranu+59Zq9PRwZehZujiefioOT9r2O4f7/yE/S9wwgRhOp4dvm1+uYcdbWp3X7Mlfc9mdDxjmyvUaYG75RjLFflz6+sF/nS19wzwRBNP4My5HJnwt3y617ivyFfjPXNl6pp32d3Ltd2HDk5rhLD3Dbjh4+ENxs9iu2PDLBGE+v4rNvd5iCZKodI4YRhIIgnZqjCkeutXG7OIzPGJud/059Zpcdc+pufpfXNU0+7mtcmwPbX2aszARhBdF9TXbmfQ6l4iw5zPgMOpUbWvkK+ZblQOfic8f3PnSOr4fvnK3wa+ByL5ubz3i305eH1/wCTKhGEN8mPSlBp8mvq08TU3cG7p+Q38y351Th+fz/mHxBr06h1Ez6+5ptDGV9dip68v7zOBGEKuVY1haj3dNT0Omn0/qG0m7g8lCtLWzV5X0X/AGfj+x9+7mL7+rXWz5ecnbsV5TnknFCMIVcyzMLXG93RXrWuW9aPNSyD7kgkEYTJVDpHDCMJBGE7NUYEiCMJBGEGqESIIgkEYQKoRIgjCQRhBqi0iCIJBGEGqESIIwkEYQKotI4YRhIIwnaqjCkQRBIIwgVQiRBGEgjCDVFpEEQSCMINUIkQRhIIwgVRaRBGEgiCDVCJH//Z";

const results = [];
async function check(name, fn) {
  const started = Date.now();
  try {
    const note = await fn();
    results.push({ name, status: note?.startsWith?.("SKIP") ? "skip" : "ok", note, ms: Date.now() - started });
  } catch (err) {
    results.push({ name, status: "FAIL", note: err.message, ms: Date.now() - started });
  }
}
async function call(path, init) {
  const res = await fetch(BASE + path, { ...init, redirect: "manual", signal: AbortSignal.timeout(75_000) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { res, text, json };
}
const post = (path, body) => call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const needsSetup = ({ res, json }) =>
  res.status >= 300 && res.status < 400 ? "login is required for this endpoint (deployment setting)"
  : json?.error && /API key/i.test(json.error) ? "DEPLOYMENT SETTING: the Anthropic API key is being rejected - an admin must fix ANTHROPIC_API_KEY in Vercel"
  : null;

await check("home page loads", async () => {
  const { res, text } = await call("/");
  assert(res.status === 200, `status ${res.status}`);
  assert(text.includes("Caption Generator"), "page title missing");
  return `${text.length} bytes`;
});

await check("client list answers with JSON", async () => {
  const r = await call("/api/clients");
  const why = needsSetup(r); if (why) return `SKIP - ${why}`;
  assert(r.res.status === 200 && Array.isArray(r.json), `status ${r.res.status}, not a JSON list`);
  return `${r.json.length} clients`;
});

await check("brand import reads pasted text (Claude key + JSON pipeline)", async () => {
  const r = await post("/api/brand-doc/parse", { text: "Tone: warm and a bit cheeky. Never use the word cheap. Always mention free delivery." });
  const why = needsSetup(r); if (why) throw new Error(why);
  assert(r.res.status === 200, `status ${r.res.status}: ${r.json?.error ?? r.text.slice(0, 120)}`);
  for (const k of ["dos", "donts", "bannedWords", "keywords", "exampleCaptions"]) assert(Array.isArray(r.json[k]), `${k} is not a list`);
  assert(r.json.bannedWords.some((w) => /cheap/i.test(w)), "did not pick up the banned word 'cheap'");
  return `banned: ${r.json.bannedWords.join(", ")}`;
});

await check("caption generation works end to end (1 platform, tiny image)", async () => {
  const r = await post("/api/generate", { platforms: ["instagram"], creativeType: "static", images: [IMAGE], postFormat: "grid", objective: "awareness" });
  const why = needsSetup(r); if (why) throw new Error(why);
  assert(r.res.status === 200, `status ${r.res.status}: ${r.json?.error ?? r.text.slice(0, 120)}`);
  const ig = r.json.platforms?.find((p) => p.platform === "instagram");
  assert(ig && ig.variants.length === 3, "expected 3 Instagram variants");
  for (const v of ig.variants) {
    assert(v.caption && v.caption.trim().length > 0, "empty caption");
    assert(!v.caption.includes("#"), "caption contains a hashtag");
  }
  assert(ig.variants.some((v) => v.caption.includes("!")), "no variant uses an exclamation mark (rule: at least one)");
  return `${ig.variants.map((v) => v.caption.length).join("/")} chars`;
});

function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log(`Smoke test against ${BASE}\n`);
for (const r of results) {
  const icon = r.status === "ok" ? "ok  " : r.status === "skip" ? "skip" : "FAIL";
  console.log(`  ${icon} ${r.name} (${(r.ms / 1000).toFixed(1)}s)${r.note ? `\n         ${r.note}` : ""}`);
}
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? " - SOMETHING IS BROKEN" : ""}`);
process.exit(failed ? 1 : 0);
