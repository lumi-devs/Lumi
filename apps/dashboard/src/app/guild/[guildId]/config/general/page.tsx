import { Settings } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { GeneralSettingsForm } from "#/components/guild/general-settings-form";
import { PageHeader } from "#/components/ui/page-header";

export default async function GuildGeneralSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Settings}
        title="General settings"
        description="Server-wide basics every module reads from: the message prefix, the role used for mutes, and the locale and timezone Lumi answers in."
      />
      {/* The form owns its own entrance beat — the SaveBar it renders is
       * `position: fixed`, and a running transform on an ancestor would
       * re-parent it. */}
      <GeneralSettingsForm
        guildId={guildId}
        settings={data.settings}
        roles={data.roles}
      />
    </div>
  );
}
