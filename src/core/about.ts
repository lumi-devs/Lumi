import { uptime } from "node:os";
import type { PrismaClient } from "@lumi/db";
import {
  buildSafeActionRows,
  createActionButton,
  makeCard,
  row,
} from "@lumi/ui";
import {
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Client,
  version as discordVersion,
  OAuth2Scopes,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Redis } from "ioredis";

interface AboutServices {
  client: Client;
  prisma: PrismaClient;
  redis: Redis;
}

const formatCount = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);

const formatMb = (bytes: number): string =>
  `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function postgresVersion(prisma: PrismaClient): Promise<string> {
  try {
    const rows =
      (await prisma.$queryRaw`SELECT version() AS version`) as Array<{
        version?: string;
      }>;
    const raw = rows[0]?.version ?? "";
    return raw.match(/PostgreSQL\s+\d+(?:\.\d+)?/)?.[0] ?? "PostgreSQL";
  } catch {
    return "PostgreSQL";
  }
}

async function redisVersion(redis: Redis): Promise<string> {
  try {
    const info = await redis.info("server");
    const version = String(info).match(/redis_version:([^\r\n]+)/)?.[1];
    return version ? `Redis ${version}` : "Redis";
  } catch {
    return "Redis";
  }
}

function inviteUrl(client: Client): string | null {
  try {
    return client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: [
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageNicknames,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageThreads,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ViewChannel,
      ],
    });
  } catch {
    return null;
  }
}

export const aboutCommand = {
  data: new SlashCommandBuilder()
    .setName("about")
    .setDescription("Show information, statistics, and architecture for Lumi"),
  async execute(
    interaction: ChatInputCommandInteraction,
    services: AboutServices,
  ): Promise<void> {
    const client = services.client;
    const guilds = Array.from(client.guilds.cache.values());
    const members = guilds.reduce(
      (sum, guild) => sum + (guild.memberCount ?? 0),
      0,
    );
    const channels = guilds.reduce(
      (sum, guild) => sum + guild.channels.cache.size,
      0,
    );
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const cpuPercent = Math.min(
      999,
      ((cpu.user + cpu.system) / 1_000_000 / Math.max(1, process.uptime())) *
        100,
    );
    const botUptime = client.uptime ?? Math.round(process.uptime() * 1000);
    const bootTime = Math.floor((Date.now() - botUptime) / 1000);
    const hostBootTime = Math.floor((Date.now() - uptime() * 1000) / 1000);
    const [database, redis] = await Promise.all([
      postgresVersion(services.prisma),
      redisVersion(services.redis),
    ]);
    const postgres = database.replace(/^PostgreSQL\s*/, "") || "unknown";
    const redisVersionNumber = redis.replace(/^Redis\s*/, "") || "unknown";
    const runtime =
      typeof Bun !== "undefined"
        ? `*Bun* v${Bun.version}`
        : `*Node* ${process.version}`;

    const body = [
      "# __Lumi__\n\n" +
        "Lumi is a powerful, self-hosted Discord administration platform designed for communities that demand full control and rock-solid reliability. Powered by TypeScript and Bun. Lumi guarantees instant command responses, modular capability, and enterprise-grade uptime for your server. The all-in-one administration platform you host yourself - moderation, leveling, economy, and logging, engineered for reliability.",
      "### 📊 __INSTANCE STATISTICS__\n" +
        `-# ${formatCount(guilds.length)} Servers · ${formatCount(members)} Members · ${formatCount(channels)} Channels\n` +
        `-# Uptime <t:${bootTime}:R> (Host Uptime <t:${hostBootTime}:R>)\n` +
        `-# Gateway \`${Math.round(client.ws.ping)}ms\` · Memory \`${formatMb(memory.rss)}\` · CPU \`${cpuPercent.toFixed(1)}%\``,
      "### ⚙️ __CORE ARCHITECTURE__\n" +
        `_Lumi version_ v2.0.0\n` +
        `${runtime} · *discord.js* v${discordVersion}\n` +
        `*PostgreSQL* ${postgres} · *Redis* v${redisVersionNumber}`,
    ];

    const primaryRow = row(
      createActionButton({
        url: "https://github.com/lumi-devs/Lumi",
        label: "Source Code",
        style: ButtonStyle.Link,
      }),
      createActionButton({
        url: "https://lumi-devs.github.io/Lumi-docs",
        label: "Documentation",
        style: ButtonStyle.Link,
      }),
    );

    const secondaryRow = row(
      createActionButton({
        url: inviteUrl(client) ?? "https://discord.com/oauth2/authorize",
        label: "Invite",
        style: ButtonStyle.Link,
      }),
      createActionButton({
        url: "https://lumi-devs.github.io/Lumi-docs/reference/data-and-privacy",
        label: "Privacy Policy",
        style: ButtonStyle.Link,
      }),
      createActionButton({
        url: "https://github.com/lumi-devs/Lumi/blob/main/LICENSE",
        label: "Terms of Service",
        style: ButtonStyle.Link,
      }),
    );

    const card = makeCard(undefined, "", body, {
      hideTitle: true,
      thumbnailUrl: client.user?.displayAvatarURL({ size: 256 }),
      actionRows: buildSafeActionRows([primaryRow, secondaryRow]),
      separatorAboveActionRows: true,
    });

    await interaction.reply(card);
  },
};
