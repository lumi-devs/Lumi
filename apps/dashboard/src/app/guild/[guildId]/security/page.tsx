import type { ReactNode } from "react";
import { PlugZap } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { guildManagementGroups } from "#/lib/guild-nav";
import {
  getGuildEntities,
  getGuildModule,
  getGuildPanicState,
} from "#/lib/guild-reads";
import { rpc } from "#/lib/rpc";
import { toggleGuildModule } from "#/actions/guild-actions";
import { PanicModeConsole } from "#/components/guild/panic-mode-console";
import { VerificationPanelCard } from "#/components/guild/verification-panel-card";
import { VerificationPreviewPlayground } from "#/components/guild/verification-preview-playground";
import { AntiNukeCard } from "#/components/guild/anti-nuke-card";
import { ConfigGroupCard } from "#/components/guild/config-group-card";
import { BackupsCard } from "#/components/guild/backups-card";
import { ModuleMasterToggle } from "#/components/guild/module-master-toggle";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { LoadFailure } from "#/components/ui/load-failure";
import { PageHeader } from "#/components/ui/page-header";
import { SectionTabs, type PageSection } from "#/components/ui/section-tabs";
import { isTextChannel } from "#/lib/channel-types";
import { sectionsOf } from "@lumi/contracts";
import type { ConfigWidget } from "@lumi/contracts";
import type { GuildBackupView } from "@lumi/contracts/rpc";
import type { PanicStateView, VerificationPanelView } from "@lumi/contracts/views";

const SecurityModuleName = "security";

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);

  const navIcon = guildManagementGroups(guildId)
    .flatMap((g) => g.links)
    .find((l) => l.href === `/guild/${guildId}/security`)?.icon;

  const [entities, { module: securityModule }] = await Promise.all([
    getGuildEntities(guildId, session.userId),
    getGuildModule(guildId, session.userId, SecurityModuleName),
  ]);
  const textChannels = entities.channels.filter((c) => isTextChannel(c.type));
  const configFields = securityModule?.configFields ?? [];
  const config = securityModule?.config ?? {};

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
    panel = (
      await rpc("guild.verificationPanel.get", { guildId, actorId: session.userId })
    ).panel;
  } catch (err) {
    panelFailure = err instanceof Error ? err.message : "The request failed.";
  }

  let backups: GuildBackupView[] = [];
  try {
    backups = (
      await rpc("guild.backups.list", { guildId, actorId: session.userId })
    ).backups;
  } catch {
    // Best-effort — the Backups card shows its own empty state either way.
  }

  const actorId = panic?.actorId;
  const actor = actorId
    ? entities.members.find((m) => m.id === actorId)
    : undefined;

  // Widgets are the only thing the dashboard chooses. Which sections exist,
  // what they are called, which groups they hold and in what order all come
  // from the security module's own `configSchema`.
  const widgets: Partial<Record<ConfigWidget, { before?: ReactNode; after?: ReactNode }>> = {
    "panic-console": {
      before:
        panic === null ? (
          <Card>
            <CardHeader>
              <CardTitle>Panic mode</CardTitle>
            </CardHeader>
            <LoadFailure
              what="Panic mode state"
              error={panicFailure}
              title="Panic mode state is unavailable"
              description="Lumi couldn't report whether this server is locked down, so the switch is hidden rather than shown in a state that might be wrong. If a raid is in progress, run /panic in Discord."
            />
          </Card>
        ) : (
          <PanicModeConsole
            guildId={guildId}
            state={panic}
            channels={textChannels}
            actorName={actor ? actor.displayName || actor.username : undefined}
          />
        ),
    },
    "join-gate": {
      after: (
        <>
          {panelFailure !== null ? (
            <Card>
              <CardHeader>
                <CardTitle>Verification panel</CardTitle>
              </CardHeader>
              <LoadFailure what="The panel record" error={panelFailure} />
            </Card>
          ) : (
            <VerificationPanelCard
              guildId={guildId}
              panel={panel}
              channels={textChannels}
            />
          )}
          <Card>
            <CardHeader>
              <CardTitle>See it in action — edit it live</CardTitle>
              <CardDescription>
                Draft the verification welcome copy and watch the panel members
                see update instantly.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <VerificationPreviewPlayground
                initialTitle={
                  typeof config["verification_panel_title"] === "string"
                    ? config["verification_panel_title"]
                    : undefined
                }
                initialWelcome={
                  typeof config["verification_panel_welcome"] === "string"
                    ? config["verification_panel_welcome"]
                    : undefined
                }
                initialFooter={
                  typeof config["verification_panel_footer"] === "string"
                    ? config["verification_panel_footer"]
                    : undefined
                }
              />
            </CardBody>
          </Card>
        </>
      ),
    },
    backups: {
      after: <BackupsCard guildId={guildId} backups={backups} />,
    },
  };

  const sections: PageSection[] = sectionsOf(configFields).map((section) => {
    const extras = section.widget ? widgets[section.widget] : undefined;
    // The nuke matrix renders its whole section itself — a limit-per-action
    // grid reads far better than the flat field list the generic card gives.
    const custom = section.widget === "anti-nuke";
    return {
      id: section.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: section.name,
      count: section.fieldCount,
      alert: section.widget === "panic-console" && Boolean(panic?.active),
      content: (
        <>
          {extras?.before}
          {custom ? (
            <AntiNukeCard
              guildId={guildId}
              config={config}
              configFields={configFields}
              roles={entities.roles}
              channels={entities.channels}
            />
          ) : (
            <ConfigGroupCard
              guildId={guildId}
              moduleName={SecurityModuleName}
              title={`${section.name} settings`}
              groups={section.groups.flatMap((g) => (g.name ? [g.name] : []))}
              config={config}
              configFields={configFields}
              roles={entities.roles}
              channels={entities.channels}
            />
          )}
          {extras?.after}
        </>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          icon={navIcon}
          title="Security"
          description="Anti-nuke, the join gate, panic mode and automatic backups — the tools that stop a raid before it finishes."
          actions={
            securityModule ? (
              <ModuleMasterToggle
                guildId={guildId}
                moduleName={SecurityModuleName}
                enabled={securityModule.enabled}
                toggle={toggleGuildModule}
              />
            ) : undefined
          }
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        {sections.length > 0 ? (
          <SectionTabs sections={sections} ariaLabel="Security sections" />
        ) : (
          <Card>
            <EmptyState
              compact
              icon={PlugZap}
              title="The security module isn't loaded"
              description="Lumi didn't report a security module for this server, so its settings can't be shown. Check that the module is installed and the bot is online."
            />
          </Card>
        )}
      </div>
    </div>
  );
}
