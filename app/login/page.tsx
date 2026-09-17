import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  async function handleSignIn() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl ?? "/" });
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-sm rounded-xl border bg-white p-8 text-center shadow-sm dark:bg-zinc-950">
        <h1 className="mb-1 text-xl font-semibold">Caption Generator</h1>
        <p className="mb-6 text-sm text-zinc-500">
          Sign in with your Re:Act Google account to continue.
        </p>
        <form action={handleSignIn}>
          <Button type="submit" className="w-full">
            Sign in with Google
          </Button>
        </form>
      </div>
    </div>
  );
}
