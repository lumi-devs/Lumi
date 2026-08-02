import { requireBotOwner } from "#/lib/auth-guards";
import { SiteHeader } from "#/components/layout/site-header";
import { SystemSidebar } from "#/components/layout/system-sidebar";

export default async function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // dashboard.md §8: Bot Owner and Server Owner tiers are completely
  // separated at the route level — this 404s (never 403s, to avoid
  // confirming the route's existence to a non-owner) anyone whose session
  // isn't in BOT_OWNERS.
  const session = await requireBotOwner();

  return (
    <>
      <SiteHeader session={session} />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-6 pb-24 md:flex-row">
        <SystemSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
