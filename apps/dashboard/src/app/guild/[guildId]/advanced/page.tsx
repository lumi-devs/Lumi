import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

/** Lower-traffic §9B rows grouped onto one page to avoid a sidebar entry each. */
export default async function AdvancedPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <div className="flex flex-col gap-6">
      <StubPage
        emoji="💤"
        title="AFK Members"
        specComponent="AfkMemberListTable"
        models={["AfkEntry"]}
        description="Live list of members currently marked AFK."
      />
      <StubPage
        emoji="🙈"
        title="Ignored Channels"
        specComponent="IgnoredChannelsList"
        models={["IgnoreEntry"]}
        description="Channels where Lumi ignores all commands."
      />
      <StubPage
        emoji="🗄️"
        title="Module Data Inspector"
        specComponent="ModuleDataKVInspector"
        models={["ModuleData"]}
        description="Raw per-module dynamic state key/value inspector."
      />
    </div>
  );
}
