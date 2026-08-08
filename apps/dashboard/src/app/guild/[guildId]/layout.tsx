import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { SiteHeader } from "#/components/layout/site-header";
import { GuildSidebar } from "#/components/layout/guild-sidebar";
import { InviteNeeded } from "#/components/invite-needed";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";

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
    <SidebarProvider>
      <GuildSidebar guildId={guildId} modules={data.modules} />
      <SidebarInset>
        <SiteHeader session={session} withSidebarTrigger />
        <div className="mx-auto w-full min-w-0 max-w-[88rem] flex-1 px-4 pt-5 pb-28 md:px-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
