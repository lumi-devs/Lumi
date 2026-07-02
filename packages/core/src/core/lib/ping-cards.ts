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
import { Colors } from "#utilities/branding.js";
import { formatUptime } from "#utilities/time.js";
import { Emojis } from "#utilities/assets.js";

// ── Re-exports for convenience ────────────────────────────────────────────────

export const PING_FLAGS = MessageFlags.IsComponentsV2 as number;
export const EPHEMERAL_FLAGS =
  (MessageFlags.IsComponentsV2 as number) | (MessageFlags.Ephemeral as number);

export type PingCategory =
  | "gateway"
  | "engine"
  | "host"
  | "postgres"
  | "redis"
  | "rabbitmq"
  | "bot";

// ── Aesthetic Helpers ─────────────────────────────────────────────────────────

function fmtMs(n: number | null): string {
  if (n === null || n < 0) return "Analyzing…";
  return `${n}ms`;
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

function sep(divider = true) {
  return new SeparatorBuilder()
    .setSpacing(SeparatorSpacingSize.Small)
    .setDivider(divider);
}

function txt(content: string) {
  return new TextDisplayBuilder().setContent(content);
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
  insight?: string,
): string {
  const header = `### ${title.toUpperCase()}`;
  const lines = fields
    .map(([label, value]) => `> **${label}**\n> ┕ ***${value}***`)
    .join("\n");
  const footer = insight ? `\n> -# *${insight}*` : "";
  return `${header}\n${lines}${footer}`;
}

function getStatusColor(data: PingData): number {
  const worst = Math.max(
    data.wsPing,
    data.prismaMs ?? 0,
    data.redisReadMs ?? 0,
  );
  const lagBad = data.loopLagMs > 10;
  if (worst > 250 || lagBad) return Colors.ROSE;
  if (worst > 100) return Colors.LEMON;
  return Colors.SAKURA;
}

function header(data: PingData, subtitle?: string): SectionBuilder {
  const sub = subtitle ? `\n*${subtitle}*` : "";
  // Invisible width anchor: ensures the card stays at maximum width even when detail content is sparse.
  // Uses \u2800 (Braille Blank) which is more reliably invisible than Hangul fillers.
  const anchor = `-# ${"\u2800".repeat(55)}`;
  return new SectionBuilder()
    .addTextDisplayComponents(txt(`## ${data.botName}${sub}\n${anchor}`))
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
  c.addSeparatorComponents(sep(true));
  return c;
}

// ── Overview card (Stacked Executive) ─────────────────────────────────────────

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
    const ping = shard.ping < 0 ? "Analyzing…" : `${shard.ping}ms`;
    content += `${E.online} Shard [${shard.id}]:\n`;
    content += `${E.space}${E.latency} Latency: ${ping}\n`;
    content += `${E.space}${E.uptime} Uptime: ${formatUptime(data.uptime)}\n`;
    content += `${E.space}${E.trade} Resources:\n`;
    content += `${E.space}${E.space}${E.memory} RAM: ${fmtMB(data.rss)}\n`;
    content += `${E.space}${E.space}${E.cpu} CPU: ${data.cpuPercent.toFixed(2)}%\n`;
    content += `${E.space}${E.position} Size:\n`;
    content += `${E.space}${E.space}${E.servers} Servers: ${fmtCount(data.guilds)}\n`;
    content += `${E.space}${E.space}${E.members} Members: ${fmtCount(data.users)}\n\n`;
  }

  content += `### External Services\n`;
  content += `${E.redis} **Redis**: ${fmtMs(data.redisReadMs)} | Hit Ratio: ${data.redisHitRatio.toFixed(1)}%\n`;
  content += `${E.sql} **SQL**: ${fmtMs(data.prismaMs)} | Load: ${data.txRate.toFixed(1)} tx/s\n`;
  content += `${E.rabbit} **RabbitMQ**: ${data.rabbitConnected ? `Connected (${data.rabbitQueued} queued)` : "Offline"}\n`;

  c.addTextDisplayComponents(txt(content));

  return c;
}

// ── Gateway detail (Stacked Executive) ────────────────────────────────────────

export function buildGatewayCard(data: PingData): ContainerBuilder {
  const c = detailCard(Colors.LAVENDER, "📡 Gateway Diagnostics Engine", data);

  const node = data.gatewayNode === "Unknown" ? "Analyzing…" : data.gatewayNode;

  c.addTextDisplayComponents(
    txt(
      [
        executiveSection(
          "Connection Stability",
          [
            ["Average Latency", fmtMs(data.wsPing)],
            ["Heartbeat Jitter", `±${data.jitterMs.toFixed(2)}ms`],
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
    c.addSeparatorComponents(sep(true));
    c.addTextDisplayComponents(txt("### 🧊 CLUSTER SHARD MATRIX"));
    const shardLines = data.shards
      .map(
        (s) =>
          `> **Shard ${s.id}**\n> ┕ ***${fmtMs(s.ping)}*** | *${s.status}* | Seq ${s.sequence || 0}`,
      )
      .join("\n");
    c.addTextDisplayComponents(txt(shardLines));
  }

  return c;
}

// ── Engine detail (Stacked Executive) ─────────────────────────────────────────

export function buildEngineCard(data: PingData): ContainerBuilder {
  const c = detailCard(Colors.LEMON, "🏎️ Runtime Performance Audit", data);

  const heapPct = ((data.heapUsed / data.heapTotal) * 100).toFixed(1);
  c.addTextDisplayComponents(
    txt(
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
            ["Event Loop Lag", `${data.loopLagMs.toFixed(3)}ms`],
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

// ── Host detail (Stacked Executive) ───────────────────────────────────────────

export function buildHostCard(data: PingData): ContainerBuilder {
  const c = detailCard(
    Colors.AMBER,
    `${Emojis.CPU} Bare Metal Infrastructure`,
    data,
  );

  c.addTextDisplayComponents(
    txt(
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
          `Uptime: ${formatUptime(data.osUptimeSecs * 1000)}`,
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

// ── Postgres detail (Stacked Executive) ───────────────────────────────────────

export function buildPostgresCard(data: PingData): ContainerBuilder {
  const c = detailCard(
    Colors.PEACH,
    `${Emojis.DATABASE} Relational Database Audit`,
    data,
  );

  c.addTextDisplayComponents(
    txt(
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
                ? formatUptime(data.dbUptimeSecs * 1000)
                : "N/A",
            ],
          ],
          `Prisma v${data.prismaVersion} | Monitoring active`,
        ),
      ].join("\n"),
    ),
  );

  if (data.tableSizes.length > 0) {
    c.addSeparatorComponents(sep(true));
    c.addTextDisplayComponents(
      txt(`### ${Emojis.ANALYTICS} HIGH-DENSITY TABLE BREAKDOWN`),
    );
    const tableLines = data.tableSizes
      .map(
        (t) =>
          `> **${t.name}**\n> ┕ ***${fmtKB(t.bytes)}***${t.deadTuples > 0n ? ` (${Emojis.WARNING_SIGN} ${t.deadTuples.toLocaleString()} dead)` : ""}`,
      )
      .join("\n");
    c.addTextDisplayComponents(txt(tableLines));
  }

  return c;
}

// ── Redis detail (Stacked Executive) ──────────────────────────────────────────

export function buildRedisCard(data: PingData): ContainerBuilder {
  const c = detailCard(
    Colors.ROSE,
    `${Emojis.CACHE} In-Memory Cache Performance`,
    data,
  );

  c.addTextDisplayComponents(
    txt(
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
          `Latency: ${fmtMs(data.redisReadMs)} / ${fmtMs(data.redisWriteMs)} | Up: ${formatUptime(data.redisUptimeSecs * 1000)}`,
        ),
      ].join("\n"),
    ),
  );

  return c;
}

// ── RabbitMQ detail (Stacked Executive) ───────────────────────────────────────

export function buildRabbitCard(data: PingData): ContainerBuilder {
  const c = detailCard(
    Colors.MINT,
    `${Emojis.QUEUE} Distributed Event Pipeline`,
    data,
  );

  if (data.rabbitConnected) {
    c.addTextDisplayComponents(
      txt(
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
      txt(
        `### ${Emojis.CROSS} PIPELINE OFFLINE\n> **Critical connection failure detected for RabbitMQ.**\n┕ -# Background tasks and inter-module RPC are suspended.`,
      ),
    );
  }

  return c;
}

// ── Bot Intelligence detail (Stacked Executive) ───────────────────────────────

export function buildBotCard(data: PingData): ContainerBuilder {
  const c = detailCard(
    Colors.SAKURA,
    `${Emojis.BOT} Core Intelligence Diagnostics`,
    data,
  );

  const memPerGuild =
    data.guilds > 0 ? (data.rss / 1024 / 1024 / data.guilds).toFixed(2) : "0";
  c.addTextDisplayComponents(
    txt(
      [
        executiveSection(
          "Interaction Analytics",
          [
            ["Command Rate", `${data.commandsPerSec.toFixed(2)}/sec`],
            ["Message Traffic", `${data.messagesPerMin.toFixed(0)}/min`],
          ],
          `Total Session: ${data.sessionCommandCount.toLocaleString()}`,
        ),
        executiveSection(
          "Efficiency Metrics",
          [
            ["Memory/Guild", `${memPerGuild} MB`],
            ["System RSS", fmtMB(data.rss)],
          ],
          `Process Uptime: ${formatUptime(data.uptime)}`,
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

// ── Router ────────────────────────────────────────────────────────────────────

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

  c.addSeparatorComponents(sep(true));
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
