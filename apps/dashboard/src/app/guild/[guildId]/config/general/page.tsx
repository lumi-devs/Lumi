import { Settings } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildShell } from "#/lib/guild-reads";
import { GeneralSettingsForm } from "#/components/guild/general-settings-form";
import { PageHeader } from "#/components/ui/page-header";

export default async function GuildGeneralSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const shell = await getGuildShell(guildId, session.userId);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Settings}
        title="General settings"
        description="Server-wide basics every module reads from: the message prefix and the locale Lumi answers in."
      />
      {/* The form owns its own entrance beat — the SaveBar it renders is
       * `position: fixed`, and a running transform on an ancestor would
       * re-parent it. */}
      <GeneralSettingsForm guildId={guildId} settings={shell.settings} />
    </div>
  );
}
