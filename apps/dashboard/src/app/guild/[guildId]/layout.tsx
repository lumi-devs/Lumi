import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { SiteHeader } from "#/components/layout/site-header";
import { GuildSidebar } from "#/components/layout/guild-sidebar";
import { InviteNeeded } from "#/components/invite-needed";

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  // dashboard.md §5B IDOR guard — re-checked here (layout) AND in every
  // Server Action in actions/guild-actions.ts, since a layout only guards
  // the page render, not a directly-invoked mutation.
  const session = await requireGuild(guildId);

  let data;
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
    <>
      <SiteHeader session={session} />
      <div className="mx-auto flex max-w-[88rem] flex-col gap-6 px-4 pt-5 pb-28 md:flex-row md:gap-8 md:px-6">
        <GuildSidebar guildId={guildId} modules={data.modules} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
