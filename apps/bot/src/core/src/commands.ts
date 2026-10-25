import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ButtonStyle,
} from "discord.js";
import { totalmem } from "node:os";
import { registry } from "@lumi/observability";
import {
  BrandColors,
  createActionButton,
  ephemeralCard,
  makeCard,
  makeErrorCard,
  makeInfoCard,
  row,
  type CardReply,
} from "@lumi/ui";

const pingSessions = new Map<string, number>();

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
  return total > 0 ? Math.round((hits / total) * 100) : 0;
}

async function getDbLatency(prisma: any): Promise<number> {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {}
  return Date.now() - t0;
}

function buildPingComponents(
  client: any,
  dbLatency: number,
  page: number,
  userId: string,
): CardReply {
  const shardIds = Array.from(client.ws.shards.keys());
  const totalPages = Math.max(1, shardIds.length);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shardId = shardIds[safePage] ?? 0;
  const shard = client.ws.shards.get(shardId);

  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const cpuPercent = Math.min(
    999,
    ((cpu.user + cpu.system) / 1_000_000 / Math.max(1, process.uptime())) * 100,
  );
  const ramMb = Math.round(mem.rss / 1024 / 1024);
  const ramPercent = Math.round((mem.rss / totalmem()) * 1000) / 10;
  const uptime = client.uptime ?? Math.round(process.uptime() * 1000);

  const guilds = client.guilds.cache.size;
  const members = Array.from(client.guilds.cache.values()).reduce(
    (sum: number, g: any) => sum + (g.memberCount ?? 0),
    0,
  );

  const actionRows = [
    row(
      createActionButton({
        customId: `ping:p:-1:${userId}`,
        emoji: "◀️",
        style: ButtonStyle.Secondary,
        disabled: safePage === 0,
      }),
      createActionButton({
        customId: `ping:close:${userId}`,
        label: "Close",
        style: ButtonStyle.Danger,
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
    BrandColors.neutral,
    `🔴 Shard [${shardId}]`,
    [
      `🕐 **Latency:** ${shard?.ping ?? "—"}ms · ⏱️ **Uptime:** ${formatUptime(uptime)}`,
      `**CPU:** ${cpuPercent.toFixed(1)}% · 💾 **RAM:** ${ramMb} MB (${ramPercent}%)`,
      `🌐 **Servers:** ${guilds} · 👥 **Members:** ${members}`,
      `### External Services\n💾 **Cache:** ${getCacheHitRatio()}% hit ratio\n🗄️ **Database:** \`${dbLatency}ms\``,
    ],
    {
      statusBadge: { status: "online" },
      footer: `Page ${safePage + 1} of ${totalPages} · Shard ${shardId}`,
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
  const maxPage = Math.max(0, services.client.ws.shards.size - 1);
  const newPage = Math.min(maxPage, Math.max(0, currentPage + delta));

  const dbLatency = await getDbLatency(services.prisma);
  pingSessions.set(userId, newPage);

  await interaction.update(buildPingComponents(services.client, dbLatency, newPage, userId));
  return true;
}

export async function handlePingClose(interaction: ButtonInteraction): Promise<boolean> {
  const [, action, userId] = interaction.customId.split(":");
  if (action !== "close" || !userId) return false;
  if (interaction.user.id !== userId) {
    await interaction.reply(ownershipDenied());
    return true;
  }
  pingSessions.delete(userId);
  await interaction.update(
    makeInfoCard("Ping", "Latency panel closed.", {
      footer: "Run `/ping` to reopen",
    }),
  );
  return true;
}
