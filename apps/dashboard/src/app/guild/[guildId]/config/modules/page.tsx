import { Puzzle } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildShell, getGuildEntities, getGuildModule } from "#/lib/guild-reads";
import { ModuleCardGrid } from "#/components/guild/module-card-grid";
import { PageHeader } from "#/components/ui/page-header";
import { Badge } from "#/components/ui/badge";
import { buildHealthChecks } from "#/lib/health-checks";

export default async function GuildModulesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const [shell, entities, security, filter] = await Promise.all([
    getGuildShell(guildId, session.userId),
    getGuildEntities(guildId, session.userId),
    getGuildModule(guildId, session.userId, "security"),
    getGuildModule(guildId, session.userId, "filter"),
  ]);

  const modules = shell.modules.filter((m) => !m.isAddon);
  const enabled = modules.filter((m) => m.enabled || m.name === "core").length;

  // Failing health checks that map onto a specific module's settings page
  // become that module's "N alerts" line — no fabricated alert data.
  const failingChecks = buildHealthChecks(
    guildId,
    entities.roles,
    security.module?.config,
    filter.module ?? undefined,
  ).filter((c) => !c.ok);
  const alertsByModule: Record<string, number> = {};
  for (const check of failingChecks) {
    if (check.fixHref === `/guild/${guildId}/security`) {
      alertsByModule.security = (alertsByModule.security ?? 0) + 1;
    } else if (check.fixHref === `/guild/${guildId}/config/modules/filter`) {
      alertsByModule.filter = (alertsByModule.filter ?? 0) + 1;
    }
  }

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
      <ModuleCardGrid guildId={guildId} modules={modules} alertsByModule={alertsByModule} />
    </div>
  );
}
