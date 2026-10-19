import Link from "next/link";
import Image from "next/image";
import { auth, signOut, isAuthConfigured } from "@/lib/auth";
import { Button } from "@/components/ui/button";

// Which build is this page running? Vercel gives every deployment its own
// permanent URL, so an old preview link keeps serving old code forever - this
// label makes that obvious at a glance (and "preview" vs "production" too).
// Only set on Vercel; hidden locally.
function buildLabel(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  if (!sha) return null;
  return `${sha} · ${process.env.VERCEL_ENV ?? "unknown"}`;
}

export async function AppHeader() {
  const session = isAuthConfigured() ? await auth() : null;
  const label = buildLabel();

  return (
    <header className="flex items-center justify-between border-b bg-card px-4 py-3">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/react-logo.png"
            alt="re:act"
            width={93}
            height={28}
            className="h-5 w-auto dark:invert"
            priority
          />
          <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
          <span className="hidden text-[15px] font-bold tracking-tight sm:inline">
            Caption Generator
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/" className="text-foreground/70 transition-colors hover:text-primary">
            Generator
          </Link>
          <Link
            href="/admin/clients"
            className="text-foreground/70 transition-colors hover:text-primary"
          >
            Clients
          </Link>
        </nav>
        {label && (
          <span
            className="hidden text-xs text-muted-foreground/70 md:inline"
            title="The version of the app this page is running"
          >
            v {label}
          </span>
        )}
      </div>
      {session?.user && (
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{session.user.email}</span>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </div>
        </form>
      )}
    </header>
  );
}
