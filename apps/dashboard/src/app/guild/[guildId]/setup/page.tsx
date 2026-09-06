import { Sparkles } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { PageHeader } from "#/components/ui/page-header";
import { SetupWizard } from "#/components/guild/setup-wizard";

export default async function GuildSetupPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  const security = data.modules.find((m) => m.name === "security");
  const mod = data.modules.find((m) => m.name === "mod");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Guided Setup"
        description="Get this server to a sane security baseline in five short stops."
        icon={Sparkles}
      />
      <SetupWizard
        guildId={guildId}
        securityFields={security?.configFields ?? []}
        securityConfig={security?.config ?? {}}
        modFields={mod?.configFields ?? []}
        modConfig={mod?.config ?? {}}
        roles={data.roles}
        channels={data.channels}
      />
    </div>
  );
}
