import { headers } from "next/headers";
import { signIn, auth } from "#/lib/auth";
import { redirect } from "next/navigation";
import { isRateLimited } from "#/lib/rate-limit";
import { Button } from "#/components/ui/button";
import { Wordmark } from "#/components/layout/wordmark";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/");

  async function loginAction() {
    "use server";
    const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
    if (await isRateLimited(`login:${ip}`, 10, 60_000)) {
      throw new Error("Too many login attempts — try again in a minute.");
    }
    await signIn("discord", { redirectTo: "/" });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-panel border border-border bg-surface p-6 shadow-e2">
        <Wordmark className="mb-5" />
        <h1 className="font-display text-[17px] font-semibold tracking-[0.01em] text-fg">
          Sign in to Lumi
        </h1>
        <p className="mt-1 mb-5 text-[12px] leading-5 text-fg-muted">
          Authenticate with Discord to manage the servers where you have Manage
          Server.
        </p>
        <form action={loginAction}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 127.14 96.36"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.79.71,1.63,1.4,2.51,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,48.12,123.86,25.29,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
            </svg>
            Continue with Discord
          </Button>
        </form>
        <p className="mt-4 text-[11px] leading-4 text-fg-subtle">
          Lumi only requests your Discord identity and guild list. It never
          reads your messages.
        </p>
      </div>
    </main>
  );
}
