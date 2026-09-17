import { kv } from "@vercel/kv";
import type { BrandProfile } from "./schemas";

/**
 * Thin wrapper around Vercel KV (Upstash Redis under the hood). All calls are
 * guarded so the app degrades gracefully in local dev when KV env vars
 * (KV_REST_API_URL / KV_REST_API_TOKEN) aren't configured yet: profile
 * features just act "empty" instead of crashing the request.
 */

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

const PROFILE_KEY = (id: string) => `profile:${id}`;
const PROFILE_INDEX_KEY = "profiles:index";
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour
const GENERATION_LOG_KEY = "logs:generations";
const GENERATION_LOG_MAX_ENTRIES = 20000;

export async function getBrandProfile(id: string): Promise<BrandProfile | null> {
  if (!kvConfigured() || !id) return null;
  try {
    const profile = await kv.get<BrandProfile>(PROFILE_KEY(id));
    return profile ?? null;
  } catch (err) {
    console.warn("KV getBrandProfile failed:", err);
    return null;
  }
}

export async function listBrandProfiles(): Promise<BrandProfile[]> {
  if (!kvConfigured()) return [];
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
  if (!kvConfigured()) {
    throw new Error(
      "Vercel KV is not configured (KV_REST_API_URL / KV_REST_API_TOKEN missing). Brand profiles can't be saved until KV is connected.",
    );
  }
  await kv.set(PROFILE_KEY(profile.id), profile);
  await kv.sadd(PROFILE_INDEX_KEY, profile.id);
}

export async function deleteBrandProfile(id: string): Promise<void> {
  if (!kvConfigured()) return;
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
  if (!kvConfigured()) return { allowed: true, remaining: limit, limit };
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
  if (!kvConfigured()) return;
  try {
    await kv.lpush(GENERATION_LOG_KEY, JSON.stringify(entry));
    await kv.ltrim(GENERATION_LOG_KEY, 0, GENERATION_LOG_MAX_ENTRIES - 1);
  } catch (err) {
    console.warn("KV logGeneration failed:", err);
  }
}

export async function listGenerationLogs(limit = GENERATION_LOG_MAX_ENTRIES): Promise<GenerationLogEntry[]> {
  if (!kvConfigured()) return [];
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

export { kvConfigured };
