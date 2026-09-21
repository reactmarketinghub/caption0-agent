import Image from "next/image";
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
    <div className="flex flex-1 items-center justify-center bg-muted/40">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center shadow-sm">
        <Image
          src="/react-logo.png"
          alt="re:act"
          width={140}
          height={42}
          className="mx-auto mb-5 h-8 w-auto dark:invert"
          priority
        />
        <h1 className="mb-1 text-xl font-bold tracking-tight">
          Caption <span className="font-serif font-normal italic">Generator</span>
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
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
