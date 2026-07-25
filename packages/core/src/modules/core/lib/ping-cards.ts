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

/** Shared scaffold for every detail card: header section, divider. */
function detailCard(
  subtitle: string,
  data: PingData,
): ContainerBuilder {
  const c = new ContainerBuilder();
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
    content += `### __Shard ${shard.id}__\n`;
    content += `${E.space}${E.latency} **Latency**: ${ping}\n`;
    content += `${E.space}${E.uptime} **Uptime**: ${container.utilities.time.formatDuration(data.uptime)}\n`;
    content += `${E.space}${E.trade} __System Resources__:\n`;
    content += `${E.space}${E.space}${E.memory} **RAM**: ${fmtMB(data.rss)}\n`;
    content += `${E.space}${E.space}${E.cpu} **CPU**: ${Math.round(data.cpuPercent)}%\n`;
    content += `${E.space}${E.position} __Community Size__:\n`;
    content += `${E.space}${E.space}${E.servers} **Servers**: ${fmtCount(data.guilds)}\n`;
    content += `${E.space}${E.space}${E.members} **Members**: ${fmtCount(data.users)}\n\n`;
  }

  content += `### __External Services__\n`;
  content += `${E.redis} **Redis Cache**: ${fmtMs(data.redisReadMs)} | Hit Ratio: ${data.redisHitRatio.toFixed(1)}%\n`;
  content += `${E.sql} **Database**: ${fmtMs(data.prismaMs)} | Load: ${data.txRate.toFixed(1)} tx/s\n`;
  content += `${E.rabbit} **Message Queue**: ${data.rabbitConnected ? `Connected (${data.rabbitQueued} queued)` : "Offline"}\n`;

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  return c;
}

export function buildGatewayCard(data: PingData): ContainerBuilder {
  const c = detailCard("📡 Gateway & Connection Status", data);

  const node = data.gatewayNode === "Unknown" ? "Analyzing…" : data.gatewayNode;

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          "Connection Health",
          [
            ["Average Latency", fmtMs(data.wsPing)],
            ["Jitter", `±${Math.round(data.jitterMs)}ms`],
          ],
          data.jitterMs < 5 ? "Status: Excellent" : "Status: Normal",
        ),
        executiveSection(
          "Session Details",
          [
            ["Initial Handshakes", `${data.identifies} times`],
            ["Successful Resumes", `${data.resumes} times`],
            ["Regional Gateway", `${node} Hub`],
          ],
          `Connected ${time(new Date(Date.now() - data.uptime), TimestampStyles.RelativeTime)}`,
        ),
        executiveSection(
          "Traffic Activity",
          [
            ["Incoming Messages", `${data.messagesPerMin.toFixed(0)} msg/min`],
            ["Active Requests", `${data.activeRequests} concurrent`],
          ],
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
        `${Emojis.SPACE}__Active Shards__:`,
      ),
    );
    const shardLines = data.shards
      .map(
        (s) =>
          `${Emojis.SPACE}${Emojis.SPACE}**Shard ${s.id}:** ${fmtMs(s.ping)} | ${s.status} | Sequence ${s.sequence || 0}`,
      )
      .join("\n");
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(shardLines));
  }

  return c;
}

export function buildEngineCard(data: PingData): ContainerBuilder {
  const c = detailCard("🏎️ Performance & Memory", data);

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
  const c = detailCard(`${Emojis.CPU} System Infrastructure`, data);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          "Processor Topology",
          [
            ["CPU Model", data.cpuModel],
            ["Logic Cores", `${data.cpuCores} Cores (${data.arch})`],
          ],
        ),
        executiveSection(
          "Memory & Swap",
          [
            [
              "System RAM",
              `${(data.ramUsed / 1024 / 1024 / 1024).toFixed(2)} GB / ${(data.ramTotal / 1024 / 1024 / 1024).toFixed(2)} GB`,
            ],
            ["Swap Used", `${(data.swapUsedKb / 1024).toFixed(0)} MB`],
          ],
        ),
        executiveSection(
          "Host Environment",
          [
            ["OS / Kernel", `${data.platform} ${data.kernel}`],
            [
              "CPU Temp",
              data.thermalCelsius
                ? `${data.thermalCelsius.toFixed(1)}°C`
                : "N/A",
            ],
          ],
          `System Uptime: ${container.utilities.time.formatDuration(data.osUptimeSecs * 1000)}`,
        ),
      ].join("\n"),
    ),
  );

  return c;
}

export function buildPostgresCard(data: PingData): ContainerBuilder {
  const c = detailCard(`${Emojis.DATABASE} Database Health`, data);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          "Performance",
          [
            ["Transaction Speed", `${data.txRate.toFixed(1)} ops/sec`],
            ["Query Response", fmtMs(data.prismaMs)],
          ],
        ),
        executiveSection(
          "Database Details",
          [
            ["Database Size", data.dbSize ?? "N/A"],
            [
              "Database Uptime",
              data.dbUptimeSecs
                ? container.utilities.time.formatDuration(
                    data.dbUptimeSecs * 1000,
                  )
                : "N/A",
            ],
          ],
          `Prisma ORM v${data.prismaVersion}`,
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
        `${Emojis.SPACE}__${Emojis.ANALYTICS} Table Storage__:`,
      ),
    );
    const tableLines = data.tableSizes
      .map(
        (t) =>
          `${Emojis.SPACE}${Emojis.SPACE}**${t.name}:** ${fmtKB(t.bytes)}`,
      )
      .join("\n");
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(tableLines));
  }

  return c;
}

export function buildRedisCard(data: PingData): ContainerBuilder {
  const c = detailCard(`${Emojis.CACHE} Cache Performance`, data);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          "Memory Usage",
          [
            ["Current Usage", fmtMB(data.redisMemUsedBytes)],
            ["Peak Usage", fmtMB(data.redisMemPeakBytes)],
          ],
        ),
        executiveSection(
          "Cache Hits & Efficiency",
          [
            ["Hit Ratio", `${data.redisHitRatio.toFixed(2)}%`],
            ["Tracked Keys", `${data.redisTotalKeys.toLocaleString()}`],
          ],
          `Hits: ${data.redisHits.toLocaleString()} | Misses: ${data.redisMisses.toLocaleString()}`,
        ),
        executiveSection(
          "Connection",
          [
            ["Redis Version", `v${data.redisVersion}`],
            ["Active Clients", `${data.redisClients} connected`],
          ],
          `Latency: ${fmtMs(data.redisReadMs)} read / ${fmtMs(data.redisWriteMs)} write`,
        ),
      ].join("\n"),
    ),
  );

  return c;
}

export function buildRabbitCard(data: PingData): ContainerBuilder {
  const c = detailCard(`${Emojis.QUEUE} Message Queue Pipeline`, data);

  if (data.rabbitConnected) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          executiveSection(
            "Connection Status",
            [
              ["Status", "Connected and healthy"],
            ],
          ),
          executiveSection(
            "Queue Load",
            [
              ["Pending Messages", `${data.rabbitQueued}`],
              ["Active Worker Processes", `${data.rabbitConsumers}`],
            ],
          ),
        ].join("\n"),
      ),
    );
  } else {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Emojis.CROSS} Message Queue Offline\n> Background tasks and event queues are currently suspended.`,
      ),
    );
  }

  return c;
}

export function buildBotCard(data: PingData): ContainerBuilder {
  const c = detailCard(`${Emojis.BOT} Bot System Summary`, data);

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
