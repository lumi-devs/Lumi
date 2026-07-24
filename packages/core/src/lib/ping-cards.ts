/**
 * Executive-Class Aesthetic Card builders.
 * High-end, structured, and extremely readable data layouts.
 * Stacked Label-Value pairs for maximized clarity.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { time, TimestampStyles } from "@discordjs/formatters";
import { ButtonStyle, MessageFlags, SeparatorSpacingSize } from "discord.js";
import type { PingData } from "./ping-collect.js";
import { container } from "@sapphire/framework";
import { Emojis } from "#lib/utilities/assets.js";

export const PING_FLAGS = MessageFlags.IsComponentsV2;
export const EPHEMERAL_FLAGS =
  MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export type PingCategory =
  "gateway" | "engine" | "host" | "postgres" | "redis" | "rabbitmq" | "bot";

function fmtMs(n: number | null): string {
  if (n === null || n < 0) return "Analyzing…";
  return `${Math.round(n)}ms`;
}

function fmtMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtKB(bytes: bigint | number): string {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} MB`;
  return `${n} B`;
}

/**
 * Stacked Executive Layout:
 * - Simple Header
 * - Blockquote wrapper
 * - Label on top
 * - Indented Value below
 */
function executiveSection(
  title: string,
  fields: [string, string][],
  _insight?: string,
): string {
  const header = `${Emojis.SPACE}__${title}__:`;
  const lines = fields
    .map(
      ([label, value]) =>
        `${Emojis.SPACE}${Emojis.SPACE}**${label}:** ${value}`,
    )
    .join("\n");
  return `${header}\n${lines}`;
}

function getStatusColor(data: PingData): number {
  const worst = Math.max(
    data.wsPing,
    data.prismaMs ?? 0,
    data.redisReadMs ?? 0,
  );
  const lagBad = data.loopLagMs > 10;
  if (worst > 250 || lagBad) return 0;
  if (worst > 100) return 0;
  return 0;
}

function header(data: PingData, subtitle?: string): SectionBuilder {
  const sub = subtitle ? `\n*${subtitle}*` : "";
  const anchor = `-# ${"\u2800".repeat(55)}`;
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${data.botName}${sub}\n${anchor}`,
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(
        data.avatarURL || "https://cdn.discordapp.com/embed/avatars/0.png",
      ),
    );
}

/** Shared scaffold for every detail card: accent color, header section, divider. */
function detailCard(
  color: number,
  subtitle: string,
  data: PingData,
): ContainerBuilder {
  const c = new ContainerBuilder();
  c.setAccentColor(color);
  c.addSectionComponents(header(data, subtitle));
  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true),
  );
  return c;
}

export function buildOverviewCard(
  data: PingData,
  _userId: string,
): ContainerBuilder {
  const c = new ContainerBuilder();
  c.setAccentColor(getStatusColor(data));

  const E = {
    online: Emojis.SUCCESS,
    space: Emojis.SPACE,
    latency: Emojis.LATENCY,
    uptime: Emojis.UPTIME,
    trade: Emojis.TRADE,
    memory: Emojis.MEMORY,
    cpu: Emojis.CPU,
    position: Emojis.POSITION,
    servers: Emojis.SERVERS,
    members: Emojis.MEMBERS,
    redis: Emojis.REDIS,
    sql: Emojis.SQL,
    rabbit: Emojis.RABBIT,
  };

  const fmtCount = (count: number) =>
    count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString();

  let content = "";

  const shards =
    data.shards.length > 0 ? data.shards : [{ id: 0, ping: data.wsPing }];

  for (const shard of shards) {
    const ping = shard.ping < 0 ? "Analyzing…" : `${Math.round(shard.ping)}ms`;
    content += `### __Shard [${shard.id}]__\n`;
    content += `${E.space}${E.latency} **Latency**: ${ping}\n`;
    content += `${E.space}${E.uptime} **Uptime**: ${container.utilities.time.formatDuration(data.uptime)}\n`;
    content += `${E.space}${E.trade} __Resources__:\n`;
    content += `${E.space}${E.space}${E.memory} **RAM**: ${fmtMB(data.rss)}\n`;
    content += `${E.space}${E.space}${E.cpu} **CPU**: ${Math.round(data.cpuPercent)}%\n`;
    content += `${E.space}${E.position} __Size__:\n`;
    content += `${E.space}${E.space}${E.servers} **Servers**: ${fmtCount(data.guilds)}\n`;
    content += `${E.space}${E.space}${E.members} **Members**: ${fmtCount(data.users)}\n\n`;
  }

  content += `### __External Services__\n`;
  content += `${E.redis} **Redis**: ${fmtMs(data.redisReadMs)} | Hit Ratio: ${data.redisHitRatio.toFixed(1)}%\n`;
  content += `${E.sql} **SQL**: ${fmtMs(data.prismaMs)} | Load: ${data.txRate.toFixed(1)} tx/s\n`;
  content += `${E.rabbit} **RabbitMQ**: ${data.rabbitConnected ? `Connected (${data.rabbitQueued} queued)` : "Offline"}\n`;

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  return c;
}

export function buildGatewayCard(data: PingData): ContainerBuilder {
  const c = detailCard(0, "📡 Gateway Diagnostics Engine", data);

  const node = data.gatewayNode === "Unknown" ? "Analyzing…" : data.gatewayNode;

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          "Connection Stability",
          [
            ["Average Latency", fmtMs(data.wsPing)],
            ["Heartbeat Jitter", `±${Math.round(data.jitterMs)}ms`],
          ],
          data.jitterMs < 5 ? "Rating: Excellent" : "Rating: Nominal",
        ),
        executiveSection(
          "Session Lifecycle",
          [
            ["Handshake Count", `${data.identifies} Identities`],
            ["Resume Attempts", `${data.resumes} Successful`],
            ["Regional Gateway", `${node} Hub`],
          ],
          `Connected ${time(new Date(Date.now() - data.uptime), TimestampStyles.RelativeTime)}`,
        ),
        executiveSection(
          "Traffic Density",
          [
            ["Observed Ingress", `${data.messagesPerMin.toFixed(0)} msg/min`],
            ["Active Requests", `${data.activeRequests} Concurrent`],
          ],
          "Real-time aggregation from regional endpoints",
        ),
      ].join("\n"),
    ),
  );

  if (data.shards.length > 0) {
    c.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    );
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${Emojis.SPACE}__Cluster Shard Matrix__:`,
      ),
    );
    const shardLines = data.shards
      .map(
        (s) =>
          `${Emojis.SPACE}${Emojis.SPACE}**Shard ${s.id}:** ${fmtMs(s.ping)} | ${s.status} | Seq ${s.sequence || 0}`,
      )
      .join("\n");
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(shardLines));
  }

  return c;
}

export function buildEngineCard(data: PingData): ContainerBuilder {
  const c = detailCard(0, "🏎️ Runtime Performance Audit", data);

  const heapPct = ((data.heapUsed / data.heapTotal) * 100).toFixed(1);
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          "Memory Allocation",
          [
            ["JS Heap Used", `${fmtMB(data.heapUsed)} (${heapPct}%)`],
            ["External Heap", fmtMB(data.external)],
            ["Total RSS Cost", fmtMB(data.rss)],
          ],
          `ArrayBuffers: ${fmtMB(data.arrayBuffers)}`,
        ),
        executiveSection(
          "Execution Lag",
          [
            ["Event Loop Lag", `${Math.round(data.loopLagMs)}ms`],
            ["Timer Handles", `${data.activeHandles} Active`],
          ],
          "Primary responsiveness metric",
        ),
        executiveSection(
          "Core Environment",
          [
            ["Engine Runtime", data.runtime],
            [
              "Library Stack",
              `D.JS v${data.djsVersion} | Sapphire v${data.sapphireVersion}`,
            ],
          ],
          "Optimized on JavaScriptCore (JSC)",
        ),
      ].join("\n"),
    ),
  );

  return c;
}

export function buildHostCard(data: PingData): ContainerBuilder {
  const c = detailCard(0, `${Emojis.CPU} Bare Metal Infrastructure`, data);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          "Processing Architecture",
          [
            ["CPU Model", data.cpuModel],
            ["Core Topology", `${data.cpuCores} Logic Cores | ${data.arch}`],
            ["Instruction Flags", data.cpuFlags],
          ],
          `IO Wait: ${data.ioWait} cycles`,
        ),
        executiveSection(
          "Resource Saturation",
          [
            [
              "RAM Utilization",
              `${(data.ramUsed / 1024 / 1024 / 1024).toFixed(2)}GB / ${(data.ramTotal / 1024 / 1024 / 1024).toFixed(2)}GB`,
            ],
            ["Total Swap Used", `${(data.swapUsedKb / 1024).toFixed(0)}MB`],
          ],
          `Saturation: ${((data.ramUsed / data.ramTotal) * 100).toFixed(1)}%`,
        ),
        executiveSection(
          "Host System State",
          [
            ["Kernel Version", `${data.platform} ${data.kernel}`],
            [
              "Processor Temp",
              data.thermalCelsius
                ? `${data.thermalCelsius.toFixed(1)}°C`
                : "N/A",
            ],
          ],
          `Uptime: ${container.utilities.time.formatDuration(data.osUptimeSecs * 1000)}`,
        ),
        executiveSection(
          "Process I/O Metrics",
          [
            ["Cumulative Read", fmtKB(data.diskReadBytes)],
            ["Cumulative Write", fmtKB(data.diskWriteBytes)],
          ],
          `Context Switches: ${data.ctxSwitchVol.toLocaleString()}`,
        ),
      ].join("\n"),
    ),
  );

  return c;
}

export function buildPostgresCard(data: PingData): ContainerBuilder {
  const c = detailCard(0, `${Emojis.DATABASE} Relational Database Audit`, data);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          "Database Throughput",
          [
            ["Transaction Rate", `${data.txRate.toFixed(1)} ops/sec`],
            ["Query Latency", fmtMs(data.prismaMs)],
          ],
          `Commits: ${data.dbCommits?.toLocaleString()}`,
        ),
        executiveSection(
          "Storage Intelligence",
          [
            ["Total DB Size", data.dbSize ?? "N/A"],
            [
              "Server Uptime",
              data.dbUptimeSecs
                ? container.utilities.time.formatDuration(
                    data.dbUptimeSecs * 1000,
                  )
                : "N/A",
            ],
          ],
          `Prisma v${data.prismaVersion} | Monitoring active`,
        ),
      ].join("\n"),
    ),
  );

  if (data.tableSizes.length > 0) {
    c.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    );
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${Emojis.SPACE}__${Emojis.ANALYTICS} Table Breakdown__:`,
      ),
    );
    const tableLines = data.tableSizes
      .map(
        (t) =>
          `${Emojis.SPACE}${Emojis.SPACE}**${t.name}:** ${fmtKB(t.bytes)}${t.deadTuples > 0n ? ` (${Emojis.WARNING_SIGN} ${t.deadTuples.toLocaleString()} dead)` : ""}`,
      )
      .join("\n");
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(tableLines));
  }

  return c;
}

export function buildRedisCard(data: PingData): ContainerBuilder {
  const c = detailCard(0, `${Emojis.CACHE} In-Memory Cache Performance`, data);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          "Memory Utilization",
          [
            ["Current Used", fmtMB(data.redisMemUsedBytes)],
            ["Recorded Peak", fmtMB(data.redisMemPeakBytes)],
            ["Frag. Ratio", `${data.redisFragRatio.toFixed(2)}x`],
          ],
          `Evicted Keys: ${data.redisEvicted.toLocaleString()}`,
        ),
        executiveSection(
          "Cache Efficiency",
          [
            ["Hit Ratio", `${data.redisHitRatio.toFixed(2)}%`],
            ["Total Keys", `${data.redisTotalKeys.toLocaleString()} Managed`],
          ],
          `Hits: ${data.redisHits.toLocaleString()} | Misses: ${data.redisMisses.toLocaleString()}`,
        ),
        executiveSection(
          "Connectivity & State",
          [
            ["Version Info", `Redis v${data.redisVersion}`],
            ["Active Clients", `${data.redisClients} Connected`],
          ],
          `Latency: ${fmtMs(data.redisReadMs)} / ${fmtMs(data.redisWriteMs)} | Up: ${container.utilities.time.formatDuration(data.redisUptimeSecs * 1000)}`,
        ),
      ].join("\n"),
    ),
  );

  return c;
}

export function buildRabbitCard(data: PingData): ContainerBuilder {
  const c = detailCard(0, `${Emojis.QUEUE} Distributed Event Pipeline`, data);

  if (data.rabbitConnected) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          executiveSection(
            "Connection Integrity",
            [
              ["Status", "Connected & Operational"],
              ["Node Heartbeat", "Active"],
            ],
            "Monitoring primary exchange synchronization",
          ),
          executiveSection(
            "RPC Saturation",
            [
              ["Pending Requests", `${data.rabbitQueued} Messages`],
              ["Active Consumers", `${data.rabbitConsumers} Workers`],
            ],
            "Monitoring lumi.rpc.requests saturation",
          ),
        ].join("\n"),
      ),
    );
  } else {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Emojis.CROSS} PIPELINE OFFLINE\n> **Critical connection failure detected for RabbitMQ.**\n┕ -# Background tasks and inter-module RPC are suspended.`,
      ),
    );
  }

  return c;
}

export function buildBotCard(data: PingData): ContainerBuilder {
  const c = detailCard(0, `${Emojis.BOT} Core Intelligence Diagnostics`, data);

  const memPerGuild =
    data.guilds > 0 ? (data.rss / 1024 / 1024 / data.guilds).toFixed(2) : "0";
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          "Interaction Analytics",
          [
            ["Command Rate", `${Math.round(data.commandsPerSec)}/sec`],
            ["Message Traffic", `${Math.round(data.messagesPerMin)}/min`],
          ],
          `Total Session: ${data.sessionCommandCount.toLocaleString()}`,
        ),
        executiveSection(
          "Efficiency Metrics",
          [
            ["Memory/Guild", `${memPerGuild} MB`],
            ["System RSS", fmtMB(data.rss)],
          ],
          `Process Uptime: ${container.utilities.time.formatDuration(data.uptime)}`,
        ),
        executiveSection(
          "Software Architecture",
          [
            ["Source Lines", `${data.codeLines.toLocaleString()} TS`],
            ["Feature Modules", `${data.modules.length} Loaded`],
          ],
          `Third-party: ${data.depCount.toLocaleString()} packages`,
        ),
      ].join("\n"),
    ),
  );

  return c;
}

export function buildDetailCard(
  category: PingCategory,
  data: PingData,
  userId: string,
): ContainerBuilder {
  const c = ((): ContainerBuilder => {
    switch (category) {
      case "gateway":
        return buildGatewayCard(data);
      case "engine":
        return buildEngineCard(data);
      case "host":
        return buildHostCard(data);
      case "postgres":
        return buildPostgresCard(data);
      case "redis":
        return buildRedisCard(data);
      case "rabbitmq":
        return buildRabbitCard(data);
      case "bot":
        return buildBotCard(data);
    }
  })();

  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ping:overview:${userId}`)
        .setLabel("Back to Overview")
        .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return c;
}
