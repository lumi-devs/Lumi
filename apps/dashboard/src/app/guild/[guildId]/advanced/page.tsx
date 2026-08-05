import { Database, EyeOff, Moon } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";
import { PageHeader } from "#/components/ui/page-header";

/** Lower-traffic §9B rows grouped onto one page to avoid a sidebar entry each. */
export default async function AdvancedPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Advanced"
        description="Lower-traffic inspectors and raw module state for this server."
      />
      <StubPage
        icon={Moon}
        title="AFK Members"
        specComponent="AfkMemberListTable"
        models={["AfkEntry"]}
        description="Live list of members currently marked AFK."
      />
      <StubPage
        icon={EyeOff}
        title="Ignored Channels"
        specComponent="IgnoredChannelsList"
        models={["IgnoreEntry"]}
        description="Channels where Lumi ignores all commands."
      />
      <StubPage
        icon={Database}
        title="Module Data Inspector"
        specComponent="ModuleDataKVInspector"
        models={["ModuleData"]}
        description="Raw per-module dynamic state key/value inspector."
      />
    </div>
  );
}
