import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export function isAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: isAuthConfigured() ? [Google] : [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ profile }) {
      if (!allowedDomain) return true; // no domain restriction configured
      const email = profile?.email ?? "";
      return email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`);
    },
    async session({ session }) {
      return session;
    },
  },
});

/**
 * Resolves the current user's email for rate limiting / logging.
 * In local dev, when Google OAuth isn't configured yet (Stages 1-4), falls
 * back to a fixed dev identity so the app is usable before Stage 5 wiring.
 */
export async function getCurrentUserEmail(): Promise<string> {
  const session = await auth();
  if (session?.user?.email) return session.user.email;
  if (!isAuthConfigured()) return "local-dev@localhost";
  throw new Error("Not authenticated");
}
