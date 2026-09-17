import { NextResponse } from "next/server";
import { kvConfigured } from "@/lib/kv";

/**
 * TEMPORARY diagnostic route - reports env var presence (never values) plus
 * which deployment/commit is actually running, to debug why env vars weren't
 * reaching the running function despite being set in Vercel.
 * DELETE this route once the mystery is solved.
 */
export async function GET() {
  const kvUrlKey = Object.keys(process.env).find((k) => k.endsWith("KV_REST_API_URL")) ?? null;

  return NextResponse.json({
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    anthropicKeyLength: process.env.ANTHROPIC_API_KEY?.length ?? 0,
    hasAuthSecret: Boolean(process.env.AUTH_SECRET),
    hasAuthGoogleId: Boolean(process.env.AUTH_GOOGLE_ID),
    kvConfigured: kvConfigured(),
    kvUrlEnvVarName: kvUrlKey,
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercelGitCommitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    deployedAt: new Date().toISOString(),
  });
}
