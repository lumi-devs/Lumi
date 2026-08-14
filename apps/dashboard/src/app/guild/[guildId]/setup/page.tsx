import { Sparkles } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { PageHeader } from "#/components/ui/page-header";
import { SetupWizard, type SetupChecklistItem } from "#/components/guild/setup-wizard";

export default async function GuildSetupPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  const security = data.modules.find((m) => m.name === "security")?.config ?? {};
  const mod = data.modules.find((m) => m.name === "mod")?.config ?? {};

  const items: SetupChecklistItem[] = [
    {
      key: "quarantineRole",
      label: "Quarantine role",
      description: "A role with no permissions, assigned to quarantined members.",
      alreadyDone: Boolean(mod["quarantine_role_id"]),
    },
    {
      key: "logsChannel",
      label: "#logs channel",
      description: "Where Anti-Nuke and Join Gate alerts are posted.",
      alreadyDone: Boolean(security["log_channel_id"]),
    },
    {
      key: "modLogsChannel",
      label: "#modlogs channel",
      description: "Where moderation case embeds (warn/mute/ban/...) are posted.",
      alreadyDone: Boolean(mod["log_channel_id"]),
    },
    {
      key: "antinuke",
      label: "Anti-Nuke",
      description: "Watch the audit log for mass bans/kicks/deletions and auto-respond.",
      alreadyDone: security["antinuke_enabled"] === true,
    },
    {
      key: "joingate",
      label: "Join Gate",
      description: "Screen new joins for raids and throwaway accounts.",
      alreadyDone: security["joingate_enabled"] === true,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Guided Setup"
        description="Get this server to a sane security baseline in one step."
        icon={Sparkles}
      />
      <SetupWizard guildId={guildId} items={items} />
    </div>
  );
}
