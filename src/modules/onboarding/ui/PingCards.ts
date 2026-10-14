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
import { ButtonStyle, MessageFlags, SeparatorSpacingSize } from "discord.js";
import type { PingData } from "#src/modules/onboarding/services/PingCollect.js";
import { componentEmoji } from "#src/lib/ui/Panels.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { PingId } from "#src/lib/interactions/Ids.js";
import { formatDuration } from "#src/lib/utilities/Time.js";

export const PingFlags = MessageFlags.IsComponentsV2;
export const EphemeralFlags =
  MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export type PingCategory =
  "gateway" | "engine" | "host" | "postgres" | "valkey" | "bot";

function fmtMs(n: number | null): string {
  if (n === null || n < 0) return "Analyzing…";
  return `${Math.round(n)}ms`;
}

export function fmtMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtBytes(bytes: bigint | number): string {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} MB`;
  return `${n} B`;
}

function executiveSection(
  title: string,
  fields: [string, string][],
): string {
  const header = `⠀__${title}__:`;
  const lines = fields
    .map(
      ([label, value]) =>
        `⠀⠀**${label}:** ${value}`,
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

function detailCard(subtitle: string, data: PingData): ContainerBuilder {
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
    space: "⠀",
    latency: "📡",
    uptime: "⏱️",
    trade: "📊",
    memory: "🧠",
    cpu: "🖥️",
    position: "📈",
    servers: "🏰",
    members: "👥",
    valkey: "🔴",
    sql: "🐘",
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
    content += `${E.space}${E.uptime} **Uptime**: ${formatDuration(data.uptime)}\n`;
    content += `${E.space}${E.trade} __System Resources__:\n`;
    content += `${E.space}${E.space}${E.memory} **RAM**: ${fmtMB(data.rss)}\n`;
    content += `${E.space}${E.space}${E.cpu} **CPU**: ${Math.round(data.cpuPercent)}%\n`;
    content += `${E.space}${E.position} __Community Size__:\n`;
    content += `${E.space}${E.space}${E.servers} **Servers**: ${fmtCount(data.guilds)}\n`;
    content += `${E.space}${E.space}${E.members} **Members**: ${fmtCount(data.users)}\n\n`;
  }

  content += `### __External Services__\n`;
  content += `${E.valkey} **Memory Cache**: Hit Ratio: ${data.valkeyHitRatio.toFixed(1)}%\n`;
  content += `${E.sql} **Database**: ${fmtMs(data.prismaMs)} | Load: ${data.txRate.toFixed(1)} tx/s\n`;

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  return c;
}

function buildGatewayCard(data: PingData, t?: LumiT): ContainerBuilder {
  const c = detailCard("📡 Gateway & Connection Status", data);

  const node = data.gatewayNode === "Unknown" ? "Analyzing…" : data.gatewayNode;

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          t ? t("core:pingHealth") : "Connection Health",
          [
            [
              t ? t("core:pingAvgLatency") : "Average Latency",
              fmtMs(data.wsPing),
            ],
            [
              t ? t("core:pingJitter") : "Jitter",
              `±${Math.round(data.jitterMs)}ms`,
            ],
          ],
        ),
        executiveSection(
          t ? t("core:pingSessionDetails") : "Session Details",
          [
            ["Initial Handshakes", `${data.identifies} times`],
            ["Successful Resumes", `${data.resumes} times`],
            ["Regional Gateway", `${node} Hub`],
          ],
        ),
        executiveSection(
          t ? t("core:pingTrafficActivity") : "Traffic Activity",
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
        `⠀__${t ? t("core:pingActiveShards") : "Active Shards"}__:`,
      ),
    );
    const shardLines = data.shards
      .map(
        (s) =>
          `⠀⠀**Shard ${s.id}:** ${fmtMs(s.ping)} | ${s.status} | Sequence ${s.sequence || 0}`,
      )
      .join("\n");
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(shardLines));
  }

  return c;
}

function buildEngineCard(data: PingData, t?: LumiT): ContainerBuilder {
  const c = detailCard("🏎️ Performance & Memory", data);

  const heapPct = ((data.heapUsed / data.heapTotal) * 100).toFixed(1);
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          t ? t("core:pingMemoryAllocation") : "Memory Allocation",
          [
            ["JS Heap Used", `${fmtMB(data.heapUsed)} (${heapPct}%)`],
            ["External Heap", fmtMB(data.external)],
            ["Total RSS Cost", fmtMB(data.rss)],
          ],
        ),
        executiveSection(
          t ? t("core:pingExecutionLag") : "Execution Lag",
          [
            ["Event Loop Lag", `${Math.round(data.loopLagMs)}ms`],
            ["Timer Handles", `${data.activeHandles} Active`],
          ],
        ),
        executiveSection(
          "Core Environment",
          [
            ["Engine Runtime", data.runtime],
            [
              "Library Stack",
              `D.JS v${data.djsVersion} | native runtime`,
            ],
          ],
        ),
      ].join("\n"),
    ),
  );

  return c;
}

function buildHostCard(data: PingData, t?: LumiT): ContainerBuilder {
  const c = detailCard(`🖥️ System Infrastructure`, data);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection(
          t ? t("core:pingProcessorTopology") : "Processor Topology",
          [
            ["CPU Model", data.cpuModel],
            ["Logic Cores", `${data.cpuCores} Cores (${data.arch})`],
          ],
        ),
        executiveSection(t ? t("core:pingMemorySwap") : "Memory & Swap", [
          [
            "System RAM",
            `${(data.ramUsed / 1024 / 1024 / 1024).toFixed(2)} GB / ${(data.ramTotal / 1024 / 1024 / 1024).toFixed(2)} GB`,
          ],
          ["Swap Used", `${(data.swapUsedKb / 1024).toFixed(0)} MB`],
        ]),
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
        ),
      ].join("\n"),
    ),
  );

  return c;
}

function buildPostgresCard(data: PingData, t?: LumiT): ContainerBuilder {
  const c = detailCard(
    `🐘 ${t ? t("core:pingDbHealth") : "Database Health"}`,
    data,
  );

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection("Performance", [
          ["Transaction Speed", `${data.txRate.toFixed(1)} ops/sec`],
          ["Query Response", fmtMs(data.prismaMs)],
        ]),
        executiveSection(
          "Database Details",
          [
            ["Database Size", data.dbSize ?? "N/A"],
            [
              "Database Uptime",
              data.dbUptimeSecs
                ? formatDuration(
                    data.dbUptimeSecs * 1000,
                  )
                : "N/A",
            ],
          ],
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
        `⠀__📊 Table Storage__:`,
      ),
    );
    const tableLines = data.tableSizes
      .map(
        (t) => `⠀⠀**${t.name}:** ${fmtBytes(t.bytes)}`,
      )
      .join("\n");
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(tableLines));
  }

  return c;
}

function buildValkeyCard(data: PingData, t?: LumiT): ContainerBuilder {
  const c = detailCard(
    `🧠 ${t ? t("core:pingCachePerformance") : "Cache Performance"}`,
    data,
  );

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        executiveSection("Memory Usage", [
          ["Current Usage", fmtMB(data.valkeyMemUsedBytes)],
          ["Peak Usage", fmtMB(data.valkeyMemPeakBytes)],
        ]),
        executiveSection(
          "Cache Hits & Efficiency",
          [
            ["Hit Ratio", `${data.valkeyHitRatio.toFixed(2)}%`],
            ["Tracked Keys", `${data.valkeyTotalKeys.toLocaleString()}`],
          ],
        ),
        executiveSection(
          "Connection",
          [
            ["Valkey Version", `v${data.valkeyVersion}`],
            ["Active Clients", `${data.valkeyClients} connected`],
          ],
        ),
      ].join("\n"),
    ),
  );

  return c;
}

function buildBotCard(data: PingData, t?: LumiT): ContainerBuilder {
  const c = detailCard(
    `🤖 ${t ? t("core:pingSummary") : "Bot System Summary"}`,
    data,
  );

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
        ),
        executiveSection(
          "Efficiency Metrics",
          [
            ["Memory/Guild", `${memPerGuild} MB`],
            ["System RSS", fmtMB(data.rss)],
          ],
        ),
        executiveSection(
          "Software Architecture",
          [
            ["Source Lines", `${data.codeLines.toLocaleString()} TS`],
            ["Feature Modules", `${data.modules.length} Loaded`],
          ],
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
  t?: LumiT,
): ContainerBuilder {
  let c: ContainerBuilder;
  switch (category) {
    case "gateway":
      c = buildGatewayCard(data, t);
      break;
    case "engine":
      c = buildEngineCard(data, t);
      break;
    case "host":
      c = buildHostCard(data, t);
      break;
    case "postgres":
      c = buildPostgresCard(data, t);
      break;
    case "valkey":
      c = buildValkeyCard(data, t);
      break;
    case "bot":
      c = buildBotCard(data, t);
      break;
  }

  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(PingId.build({ cat: "overview", userId }))
        .setLabel(t ? t("core:btnBack") : "Back to Overview")
        .setEmoji(componentEmoji("⬅️"))
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return c;
}
