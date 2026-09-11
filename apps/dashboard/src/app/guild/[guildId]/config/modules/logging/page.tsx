import { notFound } from "next/navigation";
import { PlugZap, SlidersHorizontal } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { toggleGuildModule } from "#/actions/guild-actions";
import { ConfigGroupCard } from "#/components/guild/config-group-card";
import { ModuleMasterToggle } from "#/components/guild/module-master-toggle";
import { Card } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { PageHeader } from "#/components/ui/page-header";
import { SectionTabs, type PageSection } from "#/components/ui/section-tabs";
import { sectionsOf } from "#/lib/config-sections";

const LoggingModuleName = "logging";

export default async function LoggingPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  const mod = data.modules.find((m) => m.name === LoggingModuleName);
  if (!mod) notFound();

  // Tabs, groups, fields and ordering all come from the logging module's own
  // `configSchema` — this page names nothing itself.
  const sections: PageSection[] = sectionsOf(mod.configFields).map(
    (section) => ({
      id: section.name
        ? section.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        : "settings",
      label: section.name || "Settings",
      count: section.fieldCount,
      content: (
        <ConfigGroupCard
          guildId={guildId}
          moduleName={LoggingModuleName}
          title={section.name ? `${section.name} settings` : "Settings"}
          groups={section.groups.flatMap((g) => (g.name ? [g.name] : []))}
          config={mod.config}
          configFields={mod.configFields}
          roles={data.roles}
          channels={data.channels}
        />
      ),
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={mod.displayName}
        description={mod.description}
        icon={SlidersHorizontal}
        actions={
          <ModuleMasterToggle
            guildId={guildId}
            moduleName={LoggingModuleName}
            enabled={mod.enabled}
            toggle={toggleGuildModule}
          />
        }
      />
      {sections.length > 0 ? (
        <SectionTabs sections={sections} ariaLabel="Logging sections" />
      ) : (
        <Card>
          <EmptyState
            compact
            icon={PlugZap}
            title="The logging module isn't loaded"
            description="Lumi didn't report a logging module for this server, so its settings can't be shown. Check that the module is installed and the bot is online."
          />
        </Card>
      )}
    </div>
  );
}
