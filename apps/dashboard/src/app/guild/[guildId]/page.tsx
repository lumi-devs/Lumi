import { Clock, Globe, Puzzle, Terminal } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { StatsGrid } from "#/components/stats-grid";
import { PageHeader } from "#/components/ui/page-header";
import { GeneralSettingsForm } from "#/components/guild/general-settings-form";

export default async function GuildOverviewPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  const enabledCount = data.modules.filter(
    (m) => m.enabled || m.name === "core",
  ).length;

  return (
    // Page-load choreography: header → instrument strip → settings panels, on
    // a 70ms beat (see `.rise` in globals.css). Applied at the page level, and
    // only on the two full-panel screens, so a config form the operator is
    // mid-edit never animates. Collapsed to nothing under
    // `prefers-reduced-motion`.
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {data.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.icon}
                alt=""
                className="size-6 rounded-md object-cover"
              />
            ) : (
              <span className="flex size-6 items-center justify-center rounded-md border border-border bg-bg-subtle text-[11px] font-semibold text-fg-muted">
                {data.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            {data.name}
          </span>
        }
          description="Server-wide configuration. Module-specific options live under Modules in the sidebar."
          meta={
            <code className="font-mono text-[11px] text-fg-subtle">
              {guildId}
            </code>
          }
        />
      </div>

      {/* Member/threat/VC counts need a dedicated stats RPC action this
       * rewrite doesn't add yet (no §10 contract exists for it); module +
       * guild-scoped numbers we do have are shown instead so the strip isn't
       * just placeholder text. */}
      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <StatsGrid
          stats={[
            {
              icon: Puzzle,
              label: "Modules enabled",
              value: `${enabledCount} / ${data.modules.length}`,
            },
            { icon: Globe, label: "Locale", value: data.settings.locale },
            {
              icon: Terminal,
              label: "Prefix",
              value: data.settings.prefix ?? "default",
            },
            {
              icon: Clock,
              label: "Timezone",
              value: (data.settings["timezone"] as string) ?? "UTC",
            },
          ]}
        />
      </div>

      {/* Beat 3 lives inside the form (on its card stack, not on the fragment)
       * because the SaveBar it also renders is `position: fixed` — a running
       * transform on an ancestor would re-parent it to that ancestor. */}
      <GeneralSettingsForm guildId={guildId} settings={data.settings} />
    </div>
  );
}
