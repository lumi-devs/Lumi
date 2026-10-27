import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  ButtonStyle,
} from "discord.js";
import { totalmem } from "node:os";
import { registry } from "@lumi/observability";
import {
  createActionButton,
  ephemeralCard,
  makeCard,
  makeErrorCard,
  row,
  type CardReply,
} from "@lumi/ui";

const pingSessions = new Map<string, number>();
const ShardsPerPage = 10;

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function getCounterValue(name: string): number {
  try {
    const metrics = registry.getMetricsAsArray();
    const m = (metrics as any[]).find((x: any) => x.name === name);
    if (Array.isArray(m?.values)) {
      return m.values.reduce(
        (sum: number, entry: any) => sum + Number(entry?.value ?? 0),
        0,
      );
    }
  } catch {}
  return 0;
}

function getCacheHitRatio(): number {
  const hits = getCounterValue("lumi_cache_hits_total");
  const misses = getCounterValue("lumi_cache_misses_total");
  const total = hits + misses;
  return total > 0 ? (hits / total) * 100 : 0;
}

async function getDbLatency(prisma: any): Promise<number> {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {}
  return Date.now() - t0;
}

interface ShardBlockInput {
  shardId: number;
  ping: number;
  uptime: number;
  cpuPercent: number;
  rss: number;
  ramPercent: number;
  servers: number;
  members: number;
}

function buildShardBlock(input: ShardBlockInput): string {
  return [
    `__🟢 **Shard [${input.shardId}]:** __`,
    `⠀📡 ${Math.round(input.ping)}ms · ⏱️ ${formatUptime(input.uptime)}`,
    `⠀**CPU**: ${Math.round(input.cpuPercent)}% . 📊 **RAM:** ${(input.rss / 1024 / 1024).toFixed(1)} MB . **(${input.ramPercent.toFixed(2)}%)**  `,
    `⠀📈 **Servers:** ${input.servers}· 👥 **Members:** ${input.members}`,
  ].join("\n");
}

function totalPagesFor(shardCount: number): number {
  return Math.max(1, Math.ceil(shardCount / ShardsPerPage));
}

function buildPingComponents(
  client: any,
  dbLatency: number,
  page: number,
  userId: string,
): CardReply {
  const shardIds = Array.from(client.ws.shards.keys()) as number[];
  const totalPages = totalPagesFor(shardIds.length);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const pageShardIds =
    shardIds.length === 0
      ? [0]
      : shardIds.slice(
          safePage * ShardsPerPage,
          safePage * ShardsPerPage + ShardsPerPage,
        );

  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const cpuPercent = Math.min(
    999,
    ((cpu.user + cpu.system) / 1_000_000 / Math.max(1, process.uptime())) * 100,
  );
  const ramPercent = (mem.rss / totalmem()) * 100;
  const uptime = client.uptime ?? Math.round(process.uptime() * 1000);
  const cacheHitRatio = getCacheHitRatio();
  const guilds = Array.from(client.guilds.cache.values()) as any[];

  const shardBlocks = pageShardIds.map((shardId) => {
    const shard = client.ws.shards.get(shardId);
    const shardGuilds = guilds.filter((g) => (g.shardId ?? 0) === shardId);
    return buildShardBlock({
      shardId,
      ping: shard?.ping ?? client.ws.ping ?? 0,
      uptime,
      cpuPercent,
      rss: mem.rss,
      ramPercent,
      servers: shardGuilds.length,
      members: shardGuilds.reduce(
        (sum: number, g: any) => sum + (g.memberCount ?? 0),
        0,
      ),
    });
  });

  const botName = client.user?.username ?? "Lumi";
  const externalServices = [
    "### External Services:",
    `⠀🧠 **Cache:** ${cacheHitRatio.toFixed(1)}% hit ratio `,
    `⠀ 🐘 **Database:** \`${dbLatency}ms\``,
  ].join("\n");

  const actionRows = [
    row(
      createActionButton({
        customId: `ping:p:-1:${userId}`,
        emoji: "◀️",
        style: ButtonStyle.Secondary,
        disabled: safePage === 0,
      }),
      createActionButton({
        customId: `ping:p:1:${userId}`,
        emoji: "▶️",
        style: ButtonStyle.Secondary,
        disabled: safePage === totalPages - 1,
      }),
    ),
  ];

  return makeCard(
    undefined,
    "",
    [`__## ${botName} Status:__`, ...shardBlocks, externalServices],
    {
      hideTitle: true,
      noAccent: true,
      actionRows,
      separatorAboveActionRows: true,
    },
  );
}

function ownershipDenied(): CardReply {
  return ephemeralCard(
    makeErrorCard("Ping", "This panel belongs to another user.", {
      footer: "Run `/ping` to open your own panel",
    }),
  );
}

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency and gateway heartbeat"),
  async execute(interaction: ChatInputCommandInteraction, services: { prisma: any; client: any }) {
    const userId = interaction.user.id;
    const dbLatency = await getDbLatency(services.prisma);

    pingSessions.set(userId, 0);
    await interaction.reply(buildPingComponents(services.client, dbLatency, 0, userId));
  },
};

export async function handlePingButton(
  interaction: ButtonInteraction,
  services: { prisma: any; client: any },
): Promise<boolean> {
  const [, action, deltaStr, userId] = interaction.customId.split(":");
  if (action !== "p" || !deltaStr || !userId) return false;
  if (interaction.user.id !== userId) {
    await interaction.reply(ownershipDenied());
    return true;
  }

  const delta = parseInt(deltaStr, 10);
  const currentPage = pingSessions.get(userId) ?? 0;
  const maxPage = totalPagesFor(services.client.ws.shards.size) - 1;
  const newPage = Math.min(maxPage, Math.max(0, currentPage + delta));

  const dbLatency = await getDbLatency(services.prisma);
  pingSessions.set(userId, newPage);

  await interaction.update(buildPingComponents(services.client, dbLatency, newPage, userId));
  return true;
}
