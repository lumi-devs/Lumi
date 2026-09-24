import { Sparkles } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildEntities, getGuildModule } from "#/lib/guild-reads";
import { PageHeader } from "#/components/ui/page-header";
import { SetupWizard } from "#/components/guild/setup-wizard";

export default async function GuildSetupPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const [entities, security, mod] = await Promise.all([
    getGuildEntities(guildId, session.userId),
    getGuildModule(guildId, session.userId, "security"),
    getGuildModule(guildId, session.userId, "mod"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Guided Setup"
        description="Get this server to a sane security baseline in five short stops."
        icon={Sparkles}
      />
      <SetupWizard
        guildId={guildId}
        securityFields={security.module?.configFields ?? []}
        securityConfig={security.module?.config ?? {}}
        modFields={mod.module?.configFields ?? []}
        modConfig={mod.module?.config ?? {}}
        roles={entities.roles}
        channels={entities.channels}
      />
    </div>
  );
}
