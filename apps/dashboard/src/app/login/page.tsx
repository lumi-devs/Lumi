import { headers } from "next/headers";
import { signIn, auth } from "#/lib/auth";
import { redirect } from "next/navigation";
import { isRateLimited } from "#/lib/rate-limit";
import { Button } from "#/components/ui/button";

// Branded replacement for the old server.ts `loginPage()` — same visual
// intent (glow card, "Continue with Discord"), but the actual OAuth2
// authorize redirect + state-param CSRF protection is now NextAuth's
// Discord provider, not a hand-rolled `authorizeUrl()` + cookie (dashboard.md
// §5D is handled by the library now).
export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/");

  async function loginAction() {
    "use server";
    const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
    // dashboard.md §5F: max 10/min on the login/callback flow.
    if (await isRateLimited(`login:${ip}`, 10, 60_000)) {
      throw new Error("Too many login attempts — try again in a minute.");
    }
    await signIn("discord", { redirectTo: "/" });
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4">
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(56,189,248,0.15) 0%, transparent 70%)",
        }}
      />
      <div className="glass-card relative z-10 w-full max-w-md rounded-2xl p-10 text-center shadow-2xl">
        <p className="font-brand mb-2 text-2xl font-bold">
          <span className="brand-gradient-text">✦ Lumi</span> Control Panel
        </p>
        <p className="mb-8 text-sm text-white/50">
          Configure every feature for your Discord servers instantly — no
          commands required.
        </p>
        <form action={loginAction}>
          <Button type="submit" className="w-full">
            <svg
              width="18"
              height="18"
              viewBox="0 0 127.14 96.36"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.79.71,1.63,1.4,2.51,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,48.12,123.86,25.29,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
            </svg>
            Continue with Discord
          </Button>
        </form>
      </div>
    </main>
  );
}
