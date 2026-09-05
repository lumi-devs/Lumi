import { requireGuild } from "#/lib/auth-guards";
import {
  getGuildAppeals,
  getGuildAuditLog,
  getGuildConfigHistory,
  getGuildDashboard,
  getGuildPanicState,
  getSystemShards,
} from "#/lib/dashboard-fetch";
import { StatsGrid } from "#/components/stats-grid";
import { PageHeader } from "#/components/ui/page-header";
import { SectionHead } from "#/components/ui/section-head";
import { StatusPill, StatusStrip } from "#/components/ui/status-pill";
import { ModulesStatusStrip } from "#/components/guild/modules-status-strip";
import { NeedsAttentionPanel, type AttentionRow } from "#/components/guild/needs-attention-panel";
import { OverviewRail } from "#/components/guild/overview-rail";
import { RecentAuditTable } from "#/components/guild/recent-audit-table";
import { buildModuleLabelIndex } from "#/lib/config-labels";
import { buildHealthChecks } from "#/lib/health-checks";
import { extractMemberNames } from "#/lib/log-format";
import { HealthyStatus } from "#/components/system/shard-fleet";

const FeedRows = 6;

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

  const [audit, appeals, history, shards, panic] = await Promise.all([
    safe(
      getGuildAuditLog(guildId, session.userId, {
        page: 1,
        pageSize: FeedRows,
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
        pageSize: FeedRows,
      }),
    ),
    // Fleet telemetry is an owner-only read; a guild manager simply doesn't get
    // that rail slot rather than getting a fabricated one.
    session.isBotOwner ? safe(getSystemShards(session.userId)) : null,
    safe(getGuildPanicState(guildId, session.userId)),
  ]);

  const memberNames = extractMemberNames(data.members);
  const labels = buildModuleLabelIndex(data.modules);
  const renderedAt = new Date().toISOString();

  const enabledCount = data.modules.filter(
    (m) => m.enabled || m.name === "core",
  ).length;
  const openAppeals = appeals?.total ?? 0;
  const healthyShards =
    shards?.shards.filter((s) => s.status === HealthyStatus).length ?? 0;

  const securityModule = data.modules.find((m) => m.name === "security");
  const filterModule = data.modules.find((m) => m.name === "filter");
  const failingChecks = buildHealthChecks(
    guildId,
    data.roles,
    securityModule?.config,
    filterModule,
  ).filter((c) => !c.ok);

  const attentionRows: AttentionRow[] = [];
  if (panic?.active) {
    attentionRows.push({
      id: "panic-armed",
      severity: "critical",
      title: "Panic mode is armed",
      detail: "Invites are paused and locked channels are read-only until this is reverted.",
      actionHref: `/guild/${guildId}/security`,
      actionLabel: "Details",
    });
  }
  if (shards && (shards.missingShardIds.length > 0 || healthyShards < shards.shardCount)) {
    attentionRows.push({
      id: "shard-down",
      severity: "critical",
      title: "A shard is down",
      detail: `Cluster ${shards.clusterName} · ${healthyShards} of ${shards.shardCount} shards healthy. Commands in channels on the affected shard won't respond.`,
      actionHref: "/system/shards",
      actionLabel: "Open fleet",
    });
  }
  if (openAppeals > 0) {
    attentionRows.push({
      id: "appeals-pending",
      severity: "warning",
      title: `${openAppeals} appeal${openAppeals === 1 ? "" : "s"} waiting for review`,
      detail: "Members are waiting on a moderation appeal decision.",
      actionHref: `/guild/${guildId}/appeals`,
      actionLabel: "Review",
    });
  }
  for (const check of failingChecks) {
    attentionRows.push({
      id: check.id,
      severity: "warning",
      title: check.title,
      detail: check.detail,
      actionHref: check.fixHref ?? `/guild/${guildId}/health`,
      actionLabel: check.fixLabel ?? "Details",
    });
  }

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
          {attentionRows.length > 0 ? (
            <div
              className="rise"
              style={{ "--rise-delay": "105ms" } as React.CSSProperties}
            >
              <NeedsAttentionPanel rows={attentionRows} />
            </div>
          ) : null}

          <section
            className="rise"
            style={{ "--rise-delay": "140ms" } as React.CSSProperties}
          >
            <ModulesStatusStrip guildId={guildId} modules={data.modules} />
          </section>

          <section
            className="rise"
            style={{ "--rise-delay": "210ms" } as React.CSSProperties}
          >
            <SectionHead
              title="Recent audit events"
              href={`/guild/${guildId}/monitoring/audit`}
              linkLabel="Full log"
            />
            <RecentAuditTable
              entries={audit?.entries ?? []}
              memberNames={memberNames}
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
