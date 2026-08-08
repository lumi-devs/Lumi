import { requireBotOwner } from "#/lib/auth-guards";
import { SiteHeader } from "#/components/layout/site-header";
import { SystemSidebar } from "#/components/layout/system-sidebar";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";

export default async function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 404s rather than 403s, so a non-owner can't confirm the route exists.
  const session = await requireBotOwner();

  return (
    <SidebarProvider>
      <SystemSidebar />
      <SidebarInset>
        <SiteHeader session={session} withSidebarTrigger />
        <div className="mx-auto w-full min-w-0 max-w-[88rem] flex-1 px-4 pt-5 pb-28 md:px-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
