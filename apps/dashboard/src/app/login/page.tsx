import { headers } from "next/headers";
import { signIn, auth } from "#/lib/auth";
import { redirect } from "next/navigation";
import { isRateLimited } from "#/lib/rate-limit";
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
    const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
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
        <h1 className="font-display text-[17px] font-semibold tracking-[0.01em] text-fg">
          Sign in to Lumi
        </h1>
        <p className="mt-1 mb-5 text-[12px] leading-5 text-fg-muted">
          Authenticate with Discord to manage the servers where you have Manage
          Server.
        </p>
        <LoginForm action={loginAction} />
        <p className="mt-4 text-[11px] leading-4 text-fg-subtle">
          Lumi only requests your Discord identity and guild list. It never
          reads your messages.
        </p>
      </div>
    </main>
  );
}
