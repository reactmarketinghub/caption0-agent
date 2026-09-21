import Link from "next/link";
import Image from "next/image";
import { auth, signOut, isAuthConfigured } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export async function AppHeader() {
  const session = isAuthConfigured() ? await auth() : null;

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
          <span className="h-4 w-px bg-border" aria-hidden />
          <span className="text-[15px] font-bold tracking-tight">Caption Generator</span>
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
          <Link href="/admin" className="text-foreground/70 transition-colors hover:text-primary">
            Usage
          </Link>
        </nav>
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
