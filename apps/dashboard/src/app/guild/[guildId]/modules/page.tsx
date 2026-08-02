import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { ModuleToggleGrid } from "#/components/guild/module-toggle-grid";

export default async function GuildModulesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-brand text-xl font-bold">Modules</h1>
        <p className="text-sm text-white/50">
          Enable or disable a module, or open it to edit its config fields.
        </p>
      </div>
      <ModuleToggleGrid guildId={guildId} modules={data.modules} />
    </div>
  );
}
