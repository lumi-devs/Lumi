import { headers } from "next/headers";
import { signIn, auth } from "#/lib/auth";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { isRateLimited } from "#/lib/rate-limit";
import { getClientIp } from "#/lib/client-ip";
import Link from "next/link";
import { Wordmark } from "#/components/layout/wordmark";
import { LoginForm, type LoginActionState } from "#/components/auth/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/");

  async function loginAction(
    _prevState: LoginActionState,
    _formData: FormData,
  ): Promise<LoginActionState> {
    "use server";
    // Covers only this server action, i.e. the button on this page. NextAuth's
    // own /api/auth/signin and /api/auth/callback/discord routes bypass it.
    const ip = getClientIp(await headers());
    if (await isRateLimited(`login:${ip}`, 10, 60_000)) {
      return { error: "Too many login attempts — try again in a minute." };
    }
    await signIn("discord", { redirectTo: "/" });
    return { error: null };
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-panel border border-border bg-surface p-6 shadow-e2">
        <Wordmark className="mb-5" />
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-accent-soft text-accent-fg">
            <LogIn className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[17px] font-semibold tracking-[0.01em] text-fg">
              Sign in to Lumi
            </h1>
            <p className="mt-1 text-[12px] leading-5 text-fg-muted">
              Authenticate with Discord to manage the servers where you have Manage
              Server.
            </p>
          </div>
        </div>
        <div className="mb-5" />
        <LoginForm action={loginAction} />
        <p className="mt-4 text-[11px] leading-4 text-fg-subtle">
          Signing in only shares your Discord identity and guild list with
          this dashboard. The bot&rsquo;s own message-reading permissions are
          separate and configured per-server.
        </p>
        <p className="mt-2 text-[11px] leading-4 text-fg-subtle">
          <Link href="/legal/privacy" className="underline hover:text-fg-muted">
            Privacy Policy
          </Link>{" "}
          &middot;{" "}
          <Link href="/legal/terms" className="underline hover:text-fg-muted">
            Terms of Service
          </Link>
        </p>
      </div>
    </main>
  );
}
