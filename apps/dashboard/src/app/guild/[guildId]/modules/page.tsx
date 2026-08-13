import { Puzzle } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { ModuleCardGrid } from "#/components/guild/module-card-grid";
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

  const modules = data.modules.filter((m) => !m.isAddon);
  const enabled = modules.filter((m) => m.enabled || m.name === "core").length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Modules"
        description="Enable or disable a module, or open one to edit its config fields."
        icon={Puzzle}
        actions={
          <Badge variant="neutral">
            {enabled} of {modules.length} enabled
          </Badge>
        }
      />
      <ModuleCardGrid guildId={guildId} modules={modules} />
    </div>
  );
}
