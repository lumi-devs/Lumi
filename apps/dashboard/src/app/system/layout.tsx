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
  // confirming the route's existence to a non-owner) anyone the worker's
  // `auth.whoami` didn't recognize as a bot owner.
  const session = await requireBotOwner();

  return (
    <>
      <SiteHeader session={session} />
      <div className="mx-auto flex max-w-[88rem] flex-col gap-6 px-4 pt-5 pb-28 md:flex-row md:gap-8 md:px-6">
        <SystemSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
