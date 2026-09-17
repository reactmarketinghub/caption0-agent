import Link from "next/link";
import { auth, signOut, isAuthConfigured } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export async function AppHeader() {
  const session = isAuthConfigured() ? await auth() : null;

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <nav className="flex items-center gap-4 text-sm font-medium">
        <Link href="/">Generator</Link>
        <Link href="/admin/clients" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          Clients
        </Link>
        <Link href="/admin" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          Usage
        </Link>
      </nav>
      {session?.user && (
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <div className="flex items-center gap-3 text-sm text-zinc-500">
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
