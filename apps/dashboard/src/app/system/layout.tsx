import { requireBotOwner } from "#/lib/auth-guards";
import { SiteHeader } from "#/components/layout/site-header";
import { SystemSideNav } from "#/components/layout/system-side-nav";

export default async function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 404s rather than 403s, so a non-owner can't confirm the route exists.
  const session = await requireBotOwner();

  return (
    <div className="flex min-h-svh">
      <SystemSideNav username={session.username} avatar={session.avatar} />

      <div className="flex min-w-0 flex-1 flex-col">
        <SiteHeader session={session} compact />
        <div className="mx-auto w-full min-w-0 max-w-[88rem] flex-1 px-4 pt-5 pb-28 md:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
