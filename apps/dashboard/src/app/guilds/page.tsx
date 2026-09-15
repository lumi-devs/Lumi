import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "#/lib/auth";
import { env } from "#/lib/env";
import { SiteHeader } from "#/components/layout/site-header";
import { GuildPicker } from "#/components/guild-picker";
import { inviteReturnToFrom } from "#/lib/invite";
import { rpc, RpcError } from "#/lib/rpc";
import type { GuildSummaryView } from "@lumi/contracts/rpc";

async function loadSummaries(
  guildIds: string[],
  actorId: string,
): Promise<GuildSummaryView[]> {
  if (guildIds.length === 0) return [];
  try {
    return (await rpc("guild.summaries.list", { actorId, data: { guildIds } })).summaries;
  } catch (err: unknown) {
    if (err instanceof RpcError && err.code === "UNAUTHORIZED") throw err;
    return [];
  }
}

export default async function GuildsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const summaries = await loadSummaries(
    session.guilds.map((g) => g.id),
    session.userId,
  );

  return (
    <>
      <SiteHeader session={session} />
      <GuildPicker
        session={session}
        summaries={summaries}
        clientId={env.discordClientId}
        returnTo={inviteReturnToFrom(env.dashboardPublicUrl)}
      />
      <footer
        className="rise flex justify-center gap-3 py-6 text-[13px] text-fg-subtle"
        style={{ "--rise-delay": "140ms" } as React.CSSProperties}
      >
        <Link href="/legal/privacy" className="underline hover:text-fg-muted">
          Privacy Policy
        </Link>
        <Link href="/legal/terms" className="underline hover:text-fg-muted">
          Terms of Service
        </Link>
      </footer>
    </>
  );
}
