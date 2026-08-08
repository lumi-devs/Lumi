import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { PageHeader } from "#/components/ui/page-header";
import { HealthCheckList } from "#/components/guild/health-check-list";

export default async function GuildHealthPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  const securityModule = data.modules.find((m) => m.name === "security");
  const filterModule = data.modules.find((m) => m.name === "filter");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Health Check"
        description="A read-only scan of common misconfigurations: role hierarchy, dangerous permissions, and security/filter settings left off."
      />
      <HealthCheckList
        guildId={guildId}
        roles={data.roles}
        securityConfig={securityModule?.config}
        filterModule={filterModule}
      />
    </div>
  );
}
