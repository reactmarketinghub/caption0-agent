/**
 * Vercel's "Connect Project" flow for a Blob store can apply a custom
 * Environment Variable Prefix - same gotcha already handled for KV in
 * lib/kv.ts. Connecting a store named e.g. "ClientTab" with a custom
 * prefix produces `CLIENTTAB_BLOB_READ_WRITE_TOKEN` instead of the bare
 * `BLOB_READ_WRITE_TOKEN` every `@vercel/blob` call defaults to, so code
 * checking/using the bare name sees Blob as "not configured" even though a
 * store is connected and shows Available in the dashboard. Resolve
 * whichever name is actually set and pass it explicitly as `token` to every
 * `@vercel/blob` call instead of relying on the bare env var name.
 */
export function resolveBlobToken(): string | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(process.env).find((k) => k.endsWith("_BLOB_READ_WRITE_TOKEN"));
  return key ? (process.env[key] ?? null) : null;
}

export function blobConfigured(): boolean {
  return resolveBlobToken() !== null;
}
