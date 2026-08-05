import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { ModuleToggleGrid } from "#/components/guild/module-toggle-grid";
import { PageHeader } from "#/components/ui/page-header";
import { Badge } from "#/components/ui/badge";

export default async function GuildModulesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  const enabled = data.modules.filter(
    (m) => m.enabled || m.name === "core",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Modules"
        description="Enable or disable a module, or open one to edit its config fields."
        actions={
          <Badge variant="neutral">
            {enabled} of {data.modules.length} enabled
          </Badge>
        }
      />
      <ModuleToggleGrid guildId={guildId} modules={data.modules} />
    </div>
  );
}
