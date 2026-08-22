import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "#/lib/auth";
import { SiteHeader } from "#/components/layout/site-header";
import { GuildPicker } from "#/components/guild-picker";
import { getGuildSummaries } from "#/lib/dashboard-fetch";

export default async function GuildsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const summaries = await getGuildSummaries(
    session.guilds.map((g) => g.id),
    session.userId,
  );

  return (
    <>
      <SiteHeader session={session} />
      <GuildPicker session={session} summaries={summaries} />
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
