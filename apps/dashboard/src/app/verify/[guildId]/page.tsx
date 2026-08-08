import type { Metadata } from "next";
import { Wordmark } from "#/components/layout/wordmark";
import { WebVerifyPanel } from "#/components/verify/web-verify-panel";
import { requireSession } from "#/lib/auth-guards";

export const metadata: Metadata = { title: "Verify" };

// Reachable by any signed-in Discord user, not just guild managers - that's
// the whole point of "web" verification mode, so this uses `requireSession`
// rather than `requireGuild`. The visitor is identified purely by their own
// OAuth session; there's no guildId-adjacent query param that could let one
// user verify as another.
export default async function VerifyPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-panel border border-border bg-surface p-6 shadow-e2">
        <Wordmark className="mb-5" />
        <WebVerifyPanel guildId={guildId} />
      </div>
    </main>
  );
}
