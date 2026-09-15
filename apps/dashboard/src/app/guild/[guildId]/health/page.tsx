import { Activity } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildEntities, getGuildModule } from "#/lib/guild-reads";
import { PageHeader } from "#/components/ui/page-header";
import { HealthCheckList } from "#/components/guild/health-check-list";

export default async function GuildHealthPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const [entities, security, filter] = await Promise.all([
    getGuildEntities(guildId, session.userId),
    getGuildModule(guildId, session.userId, "security"),
    getGuildModule(guildId, session.userId, "filter"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Health dashboard"
        description="A read-only scan of common misconfigurations: role hierarchy, dangerous permissions, and security/filter settings left off."
        icon={Activity}
      />
      <HealthCheckList
        guildId={guildId}
        roles={entities.roles}
        securityConfig={security.module?.config}
        filterModule={filter.module ?? undefined}
      />
    </div>
  );
}
