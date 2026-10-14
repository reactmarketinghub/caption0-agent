/**
 * Reads a fetch Response as JSON without ever throwing a raw parse error.
 *
 * Our API routes always answer with JSON, but when Vercel itself kills a
 * function (timeout, crash, platform error) it replies with a plain-text/HTML
 * page instead - and `res.json()` on that surfaces as the baffling
 * `Unexpected token 'A', "An error o"... is not valid JSON`. This turns that
 * into a message a person can act on.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors res.json()'s `any`
export async function readApiJson<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(friendlyStatusMessage(res.status));
  }
}

export function friendlyStatusMessage(status: number): string {
  if (status === 504 || status === 408) {
    return "That took too long and the server gave up. Please try again - it usually works on a second try.";
  }
  if (status === 413) return "That upload is too large. Try a smaller file.";
  if (status >= 500) {
    return "The server hit a problem and couldn't finish. Please try again in a moment - if it keeps happening, let the dev team know.";
  }
  return "Something went wrong reading the server's reply. Please try again.";
}
