import { createClient, type VercelKV } from "@vercel/kv";
import type { BrandProfile } from "./schemas";

/**
 * Thin wrapper around Vercel KV (Upstash Redis under the hood). All calls are
 * guarded so the app degrades gracefully in local dev when KV isn't
 * configured yet: profile features just act "empty" instead of crashing.
 *
 * Vercel's "Connect Project" flow for a Marketplace Upstash store can apply a
 * custom Environment Variable Prefix (e.g. connecting with prefix "CLIENTTAB"
 * produces CLIENTTAB_KV_REST_API_URL / CLIENTTAB_KV_REST_API_TOKEN instead of
 * the bare names). Rather than depend on no prefix being set, we scan for
 * whichever *_KV_REST_API_URL / *_KV_REST_API_TOKEN pair exists.
 */

interface KvCredentials {
  url: string;
  token: string;
}

function resolveKvCredentials(): KvCredentials | null {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  }
  const urlKey = Object.keys(process.env).find((k) => k.endsWith("_KV_REST_API_URL"));
  if (urlKey) {
    const prefix = urlKey.slice(0, -"_KV_REST_API_URL".length);
    const url = process.env[urlKey];
    const token = process.env[`${prefix}_KV_REST_API_TOKEN`];
    if (url && token) return { url, token };
  }
  return null;
}

let cachedClient: VercelKV | null = null;
let cachedCredentialsKey: string | null = null;

/** Returns a working KV client, or null if nothing is configured. */
function getKv(): VercelKV | null {
  const creds = resolveKvCredentials();
  if (!creds) return null;
  const credentialsKey = `${creds.url}:${creds.token}`;
  if (cachedClient && cachedCredentialsKey === credentialsKey) return cachedClient;
  cachedClient = createClient(creds);
  cachedCredentialsKey = credentialsKey;
  return cachedClient;
}

function kvConfigured(): boolean {
  return resolveKvCredentials() !== null;
}

const PROFILE_KEY = (id: string) => `profile:${id}`;
const PROFILE_INDEX_KEY = "profiles:index";
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour
const GENERATION_LOG_KEY = "logs:generations";
const GENERATION_LOG_MAX_ENTRIES = 20000;
const BRAND_DOC_LOG_KEY = "logs:brand-doc-uploads";
const BRAND_DOC_LOG_MAX_ENTRIES = 500;

export async function getBrandProfile(id: string): Promise<BrandProfile | null> {
  const kv = getKv();
  if (!kv || !id) return null;
  try {
    const profile = await kv.get<BrandProfile>(PROFILE_KEY(id));
    return profile ?? null;
  } catch (err) {
    console.warn("KV getBrandProfile failed:", err);
    return null;
  }
}

export async function listBrandProfiles(): Promise<BrandProfile[]> {
  const kv = getKv();
  if (!kv) return [];
  try {
    const ids = await kv.smembers(PROFILE_INDEX_KEY);
    if (!ids.length) return [];
    const profiles = await Promise.all(ids.map((id) => kv.get<BrandProfile>(PROFILE_KEY(id))));
    return profiles
      .filter((p): p is BrandProfile => Boolean(p))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  } catch (err) {
    console.warn("KV listBrandProfiles failed:", err);
    return [];
  }
}

export async function saveBrandProfile(profile: BrandProfile): Promise<void> {
  const kv = getKv();
  if (!kv) {
    throw new Error(
      "Vercel KV is not configured. Brand profiles can't be saved until a KV/Redis store is connected.",
    );
  }
  await kv.set(PROFILE_KEY(profile.id), profile);
  await kv.sadd(PROFILE_INDEX_KEY, profile.id);
}

export async function deleteBrandProfile(id: string): Promise<void> {
  const kv = getKv();
  if (!kv) return;
  await kv.del(PROFILE_KEY(id));
  await kv.srem(PROFILE_INDEX_KEY, id);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/** Fixed-window per-user rate limit (default 30/hour). Fails open if KV isn't configured. */
export async function checkAndConsumeRateLimit(
  userId: string,
  limit = 30,
): Promise<RateLimitResult> {
  const kv = getKv();
  if (!kv) return { allowed: true, remaining: limit, limit };
  try {
    const windowBucket = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SECONDS);
    const key = `ratelimit:${userId}:${windowBucket}`;
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), limit };
  } catch (err) {
    console.warn("KV rate limit check failed, failing open:", err);
    return { allowed: true, remaining: limit, limit };
  }
}

export interface GenerationLogEntry {
  timestamp: string;
  userEmail: string;
  clientId?: string;
  clientName?: string;
  platforms: string[];
  creativeType: "static" | "carousel" | "video";
  inputTokens: number;
  outputTokens: number;
}

export async function logGeneration(entry: GenerationLogEntry): Promise<void> {
  const kv = getKv();
  if (!kv) return;
  try {
    await kv.lpush(GENERATION_LOG_KEY, JSON.stringify(entry));
    await kv.ltrim(GENERATION_LOG_KEY, 0, GENERATION_LOG_MAX_ENTRIES - 1);
  } catch (err) {
    console.warn("KV logGeneration failed:", err);
  }
}

export async function listGenerationLogs(limit = GENERATION_LOG_MAX_ENTRIES): Promise<GenerationLogEntry[]> {
  const kv = getKv();
  if (!kv) return [];
  try {
    const raw = await kv.lrange(GENERATION_LOG_KEY, 0, limit - 1);
    return raw
      .map((r) => {
        try {
          return JSON.parse(r) as GenerationLogEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is GenerationLogEntry => Boolean(e));
  } catch (err) {
    console.warn("KV listGenerationLogs failed:", err);
    return [];
  }
}

export interface BrandDocLogEntry {
  timestamp: string;
  userEmail: string;
  fileName: string;
  status: "success" | "error";
  error?: string;
  /** Client name typed in the form at upload time, if any (client may not be saved yet). */
  clientName?: string;
}

/** Recent brand-doc/screenshot upload+extraction attempts, shown on the clients list page. */
export async function logBrandDocUpload(entry: BrandDocLogEntry): Promise<void> {
  const kv = getKv();
  if (!kv) return;
  try {
    await kv.lpush(BRAND_DOC_LOG_KEY, JSON.stringify(entry));
    await kv.ltrim(BRAND_DOC_LOG_KEY, 0, BRAND_DOC_LOG_MAX_ENTRIES - 1);
  } catch (err) {
    console.warn("KV logBrandDocUpload failed:", err);
  }
}

export async function listBrandDocLogs(limit = 20): Promise<BrandDocLogEntry[]> {
  const kv = getKv();
  if (!kv) return [];
  try {
    const raw = await kv.lrange(BRAND_DOC_LOG_KEY, 0, limit - 1);
    return raw
      .map((r) => {
        try {
          return JSON.parse(r) as BrandDocLogEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is BrandDocLogEntry => Boolean(e));
  } catch (err) {
    console.warn("KV listBrandDocLogs failed:", err);
    return [];
  }
}

export { kvConfigured };
