import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { SiteHeader } from "#/components/layout/site-header";
import { GuildSideNav } from "#/components/layout/guild-side-nav";
import { InviteNeeded } from "#/components/invite-needed";
import type { DashboardData } from "#/lib/dashboard-data";

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  // A layout only guards the page render, so every Server Action re-checks too.
  const session = await requireGuild(guildId);

  let data: DashboardData;
  try {
    data = await getGuildDashboard(guildId, session.userId);
  } catch {
    return (
      <>
        <SiteHeader session={session} />
        <InviteNeeded guildId={guildId} />
      </>
    );
  }

  return (
    <div className="flex min-h-svh">
      {/* Only serializable values cross here; see side-nav.tsx. */}
      <GuildSideNav
        guildId={guildId}
        guildName={data.name}
        guildIcon={data.icon}
        memberCount={data.memberCount}
        guilds={session.guilds.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.icon,
        }))}
        username={session.username}
        avatar={session.avatar}
        isBotOwner={session.isBotOwner}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <SiteHeader session={session} compact />
        <div className="mx-auto w-full min-w-0 max-w-[88rem] flex-1 px-4 pt-5 pb-28 md:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
