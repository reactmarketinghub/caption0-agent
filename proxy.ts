import { NextResponse, type NextRequest } from "next/server";
import { auth, isAuthConfigured } from "@/lib/auth";

// TEMP: /api/debug is public while we track down the missing-env-var issue.
// Remove "/api/debug" once that's resolved and the route below is deleted.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/debug"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isAuthConfigured()) {
    // Google OAuth not configured yet (e.g. local dev on Stages 1-4) - let requests through.
    return NextResponse.next();
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const session = await auth();
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
