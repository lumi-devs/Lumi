import { requireGuild } from "#/lib/auth-guards";
import {
  getGuildAppeals,
  getGuildAuditLog,
  getGuildConfigHistory,
  getGuildDashboard,
  getSystemShards,
} from "#/lib/dashboard-fetch";
import { StatsGrid } from "#/components/stats-grid";
import { PageHeader } from "#/components/ui/page-header";
import { SectionHead } from "#/components/ui/section-head";
import { StatusPill, StatusStrip } from "#/components/ui/status-pill";
import { GeneralSettingsForm } from "#/components/guild/general-settings-form";
import { ModuleCardGrid } from "#/components/guild/module-card-grid";
import { OverviewRail } from "#/components/guild/overview-rail";
import { RecentAuditTable } from "#/components/guild/recent-audit-table";
import { buildModuleLabelIndex } from "#/lib/config-labels";
import { extractMemberNames } from "#/lib/log-format";
import { HEALTHY_STATUS } from "#/components/system/shard-fleet";

const MODULE_CARDS = 6;
const FEED_ROWS = 6;

// Every panel below the header is a separate RPC read: one failing (the worker
// restarting mid-render, say) must degrade that panel only, never blank the
// overview. `null` means "no data to show", and each consumer renders its own
// empty/omitted state.
async function safe<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch {
    return null;
  }
}

export default async function GuildOverviewPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  const [audit, appeals, history, shards] = await Promise.all([
    safe(
      getGuildAuditLog(guildId, session.userId, {
        page: 1,
        pageSize: FEED_ROWS,
      }),
    ),
    safe(
      getGuildAppeals(guildId, session.userId, {
        status: "pending",
        page: 1,
        pageSize: 1,
      }),
    ),
    safe(
      getGuildConfigHistory(guildId, session.userId, {
        page: 1,
        pageSize: FEED_ROWS,
      }),
    ),
    // Fleet telemetry is an owner-only read; a guild manager simply doesn't get
    // that rail slot rather than getting a fabricated one.
    session.isBotOwner ? safe(getSystemShards(session.userId)) : null,
  ]);

  const memberNames = extractMemberNames(data.members);
  const labels = buildModuleLabelIndex(data.modules);
  const renderedAt = new Date().toISOString();

  const enabledCount = data.modules.filter(
    (m) => m.enabled || m.name === "core",
  ).length;
  const openAppeals = appeals?.total ?? 0;
  const healthyShards =
    shards?.shards.filter((s) => s.status === HEALTHY_STATUS).length ?? 0;

  return (
    // Page-load choreography: header → instrument strip → panels, on a 70ms
    // beat (see `.rise` in globals.css). Collapsed to nothing under
    // `prefers-reduced-motion`.
    <div className="flex flex-col gap-5">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          className="pb-0"
          title={
            <span className="flex items-center gap-2.5">
              {data.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.icon}
                  alt=""
                  className="size-6 rounded-control object-cover"
                />
              ) : (
                <span className="flex size-6 items-center justify-center rounded-control border border-border bg-bg-subtle text-[13px] font-semibold text-fg-muted">
                  {data.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              {data.name}
            </span>
          }
          description={
            <>
              Guild overview ·{" "}
              <code className="font-mono text-[13px] text-fg-subtle">
                {guildId}
              </code>
            </>
          }
          actions={
            <StatusStrip>
              <StatusPill
                tone={enabledCount > 1 ? "good" : "warn"}
                label="Modules"
                value={`${enabledCount}/${data.modules.length}`}
              />
              <StatusPill
                tone={openAppeals > 0 ? "warn" : "good"}
                label="Open appeals"
                value={openAppeals}
              />
              {shards ? (
                <StatusPill
                  tone={
                    shards.missingShardIds.length > 0 ||
                    healthyShards < shards.shardCount
                      ? "bad"
                      : "good"
                  }
                  label="Shards"
                  value={`${healthyShards}/${shards.shardCount}`}
                />
              ) : null}
            </StatusStrip>
          }
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <StatsGrid
          stats={[
            { label: "Members", value: data.memberCount, countUp: true },
            {
              label: "Modules enabled",
              value: enabledCount,
              unit: `/ ${data.modules.length}`,
            },
            {
              label: "Audit entries",
              value: audit?.total ?? "—",
            },
            {
              label: "Open appeals",
              value: openAppeals,
              tone: openAppeals > 0 ? "warning" : "default",
            },
          ]}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            className="rise"
            style={{ "--rise-delay": "140ms" } as React.CSSProperties}
          >
            <SectionHead
              title="Modules"
              href={`/guild/${guildId}/modules`}
              linkLabel="Manage all"
            />
            <ModuleCardGrid
              guildId={guildId}
              modules={data.modules.slice(0, MODULE_CARDS)}
            />
          </section>

          <section
            className="rise"
            style={{ "--rise-delay": "210ms" } as React.CSSProperties}
          >
            <SectionHead
              title="Recent audit events"
              href={`/guild/${guildId}/audit`}
              linkLabel="Full log"
            />
            <RecentAuditTable
              entries={audit?.entries ?? []}
              memberNames={memberNames}
            />
          </section>

          <section>
            <SectionHead title="Server settings" />
            {/* Beat 4 lives inside the form (on its card stack, not on this
             * section) because the SaveBar it also renders is `position:
             * fixed` — a running transform on an ancestor would re-parent it. */}
            <GeneralSettingsForm
              guildId={guildId}
              settings={data.settings}
              roles={data.roles}
              channels={data.channels}
            />
          </section>
        </div>

        <OverviewRail
          className="rise [--rise-delay:280ms]"
          shards={shards}
          changes={history?.entries ?? []}
          actorNames={memberNames}
          labels={labels}
          roles={data.roles}
          channels={data.channels}
          renderedAt={renderedAt}
        />
      </div>
    </div>
  );
}
