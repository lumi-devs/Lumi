import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function BlocklistPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <StubPage
      emoji="🚫"
      title="Blocklist"
      specComponent="GuildBlocklistTable"
      models={["Blocklist (guildId IS NOT NULL)"]}
      description="Server-specific bot blacklist — Lumi ignores these users entirely in this guild."
    />
  );
}
