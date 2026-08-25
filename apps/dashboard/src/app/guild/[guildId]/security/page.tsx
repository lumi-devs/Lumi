import { PlugZap } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import {
  getGuildBackups,
  getGuildDashboard,
  getGuildPanicState,
  getGuildVerificationPanel,
} from "#/lib/dashboard-fetch";
import { toggleGuildModule } from "#/actions/guild-actions";
import { PanicModeConsole } from "#/components/guild/panic-mode-console";
import { VerificationPanelCard } from "#/components/guild/verification-panel-card";
import { AntiNukeCard } from "#/components/guild/anti-nuke-card";
import { JoinGateCard } from "#/components/guild/join-gate-card";
import { BackupsCard } from "#/components/guild/backups-card";
import { ModuleMasterToggle } from "#/components/guild/module-master-toggle";
import { Card, CardHeader, CardTitle } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { PageHeader } from "#/components/ui/page-header";
import { isTextChannel } from "#/lib/channel-types";
import type { GuildBackupView } from "@lumi/contracts";
import type { PanicStateView, VerificationPanelView } from "#/lib/dashboard-data";

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);

  const dashboard = await getGuildDashboard(guildId, session.userId);
  const textChannels = dashboard.channels.filter((c) => isTextChannel(c.type));
  const securityModule = dashboard.modules.find((m) => m.name === "security");

  let panic: PanicStateView | null = null;
  let panicFailure: string | null = null;
  try {
    panic = await getGuildPanicState(guildId, session.userId);
  } catch (err) {
    panicFailure = err instanceof Error ? err.message : "The request failed.";
  }

  let panel: VerificationPanelView | null = null;
  let panelFailure: string | null = null;
  try {
    panel = await getGuildVerificationPanel(guildId, session.userId);
  } catch (err) {
    panelFailure = err instanceof Error ? err.message : "The request failed.";
  }

  let backups: GuildBackupView[] = [];
  try {
    backups = await getGuildBackups(guildId, session.userId);
  } catch {
    // Best-effort — the Backups card shows its own empty state either way.
  }

  const actorId = panic?.actorId;
  const actor = actorId
    ? dashboard.members.find((m) => m.id === actorId)
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Security"
          description="Anti-nuke, the join gate, panic mode and automatic backups — the tools that stop a raid before it finishes."
          actions={
            securityModule ? (
              <ModuleMasterToggle
                guildId={guildId}
                moduleName="security"
                enabled={securityModule.enabled}
                toggle={toggleGuildModule}
              />
            ) : undefined
          }
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        {panic === null ? (
          <Card>
            <CardHeader>
              <CardTitle>Panic mode</CardTitle>
            </CardHeader>
            <EmptyState
              compact
              icon={PlugZap}
              title="Panic mode state is unavailable"
              description="Lumi couldn't report whether this server is locked down, so the switch is hidden rather than shown in a state that might be wrong. If a raid is in progress, run /panic in Discord."
              footnote={panicFailure ?? undefined}
            />
          </Card>
        ) : (
          <PanicModeConsole
            guildId={guildId}
            state={panic}
            channels={textChannels}
            actorName={actor ? actor.displayName || actor.username : undefined}
          />
        )}
      </div>

      {securityModule ? (
        <div className="rise" style={{ "--rise-delay": "105ms" } as React.CSSProperties}>
          <AntiNukeCard guildId={guildId} config={securityModule.config} />
        </div>
      ) : null}

      {securityModule ? (
        <div className="rise" style={{ "--rise-delay": "140ms" } as React.CSSProperties}>
          <JoinGateCard guildId={guildId} config={securityModule.config} />
        </div>
      ) : null}

      <div className="rise" style={{ "--rise-delay": "175ms" } as React.CSSProperties}>
        {panelFailure !== null ? (
          <Card>
            <CardHeader>
              <CardTitle>Verification panel</CardTitle>
            </CardHeader>
            <EmptyState
              compact
              icon={PlugZap}
              title="The panel record couldn't be loaded"
              description="Check that the bot is online and connected to the message broker, then reload this page."
              footnote={panelFailure}
            />
          </Card>
        ) : (
          <VerificationPanelCard
            guildId={guildId}
            panel={panel}
            channels={textChannels}
          />
        )}
      </div>

      <div className="rise" style={{ "--rise-delay": "210ms" } as React.CSSProperties}>
        <BackupsCard guildId={guildId} backups={backups} />
      </div>
    </div>
  );
}
