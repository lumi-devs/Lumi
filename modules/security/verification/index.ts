import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
  type TaskDefinition,
} from "@lumi/module-kit";
import {
  cardCreateOptions,
  createActionButton,
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  row,
} from "@lumi/ui";
import {
  type ButtonInteraction,
  ButtonStyle,
  type GuildMember,
  SlashCommandBuilder,
} from "discord.js";
import { z } from "zod";
import { getSecurityConfig } from "../config.js";
import {
  deleteStored,
  fetchMember,
  getStoredJson,
  readModuleConfig,
  redisOf,
  securityCard,
  securityKey,
  sendSecurityLog,
  setStoredJson,
} from "../shared.js";

const ModuleName = "security-verification";

const VerificationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  verifiedRoleId: z.string().nullable().default(null),
  pendingRoleId: z.string().nullable().default(null),
  timeoutMinutes: z.number().int().min(1).max(1440).default(10),
  kickOnTimeout: z.boolean().default(false),
  mode: z.enum(["emoji", "none", "web"]).default("emoji"),
  target: z.enum(["everyone", "suspicious"]).default("everyone"),
});

type VerificationConfig = z.infer<typeof VerificationConfigSchema>;

interface PendingEntry {
  userId: string;
  expiresAt: number;
}

const ButtonPrefix = "lumi:verify";

function pendingKey(guildId: string, userId: string): string {
  return securityKey("verification", "pending", guildId, userId);
}

function pendingSetKey(guildId: string): string {
  return securityKey("verification", "pending-set", guildId);
}

function isSuspicious(member: GuildMember): boolean {
  if (!member.user.avatar) return true;
  return Date.now() - member.user.createdTimestamp < 7 * 86_400_000;
}

function verifyCard(member: GuildMember): ReturnType<typeof makeInfoCard> {
  return {
    ...makeInfoCard(
      "✅ Verification",
      [
        `Welcome <@${member.id}>!`,
        "",
        "Press the button below to prove you are human and unlock the server.",
      ],
      {
        actionRows: [
          row(
            createActionButton({
              customId: `${ButtonPrefix}:${member.guild.id}:${member.id}`,
              label: "Verify",
              emoji: "✅",
              style: ButtonStyle.Success,
            }),
          ),
        ],
      },
    ),
    allowedMentions: { users: [member.id] },
  };
}

async function sendVerification(
  services: ModuleServices,
  member: GuildMember,
): Promise<void> {
  const guild = member.guild;
  const card = verifyCard(member);
  const security = await getSecurityConfig(services, guild.id);
  if (security.logChannelId) {
    const channel = await services.client.channels
      .fetch(security.logChannelId)
      .catch(() => null);
    if (channel?.isTextBased() && "send" in channel) {
      await channel.send(cardCreateOptions(card)).catch(() => undefined);
      return;
    }
  }
  await member.send(cardCreateOptions(card)).catch(() => undefined);
}

async function addPending(
  services: ModuleServices,
  member: GuildMember,
  config: VerificationConfig,
): Promise<void> {
  const redis = redisOf(services);
  const expiresAt = Date.now() + config.timeoutMinutes * 60_000;
  await setStoredJson(
    redis,
    pendingKey(member.guild.id, member.id),
    { userId: member.id, expiresAt } satisfies PendingEntry,
    config.timeoutMinutes * 60 + 3600,
  );
  if (redis) await redis.sadd(pendingSetKey(member.guild.id), member.id);
}

async function clearPending(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<void> {
  const redis = redisOf(services);
  await deleteStored(redis, pendingKey(guildId, userId));
  if (redis) await redis.srem(pendingSetKey(guildId), userId);
}

async function grantVerified(
  services: ModuleServices,
  member: GuildMember,
  config: VerificationConfig,
): Promise<boolean> {
  if (!config.verifiedRoleId) return false;
  return member.roles
    .add(config.verifiedRoleId, "Verification complete")
    .then(async () => {
      if (config.pendingRoleId) {
        await member.roles
          .remove(config.pendingRoleId, "Verification complete")
          .catch(() => undefined);
      }
      return true;
    })
    .catch((error: unknown) => {
      services.observability?.logger?.warn?.("verification role grant failed", {
        guildId: member.guild.id,
        userId: member.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    });
}

const onMemberAddListener: ListenerDefinition = {
  event: "guildMemberAdd",
  async handler(member: GuildMember, services: ModuleServices) {
    const config = await readModuleConfig(
      services,
      member.guild.id,
      ModuleName,
      VerificationConfigSchema,
      ModuleName,
    );
    if (!config.enabled) return;
    if (config.target === "suspicious" && !isSuspicious(member)) return;

    if (config.mode === "none") {
      const granted = await grantVerified(services, member, config);
      await sendSecurityLog(
        services,
        member.guild.id,
        securityCard("✅ Auto-Verified", [
          `**Member**\n<@${member.id}>`,
          `**Result**\n${granted ? "Verified" : "Role not configured"}`,
        ]),
      );
      return;
    }

    if (config.pendingRoleId) {
      await member.roles
        .add(config.pendingRoleId, "Awaiting verification")
        .catch(() => undefined);
    }
    await addPending(services, member, config);
    await sendVerification(services, member);
  },
};

const onMemberRemoveListener: ListenerDefinition = {
  event: "guildMemberRemove",
  async handler(member: GuildMember, services: ModuleServices) {
    await clearPending(services, member.guild.id, member.id);
  },
};

const onInteractionListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: ButtonInteraction, services: ModuleServices) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(`${ButtonPrefix}:`)) return;
    if (!interaction.guildId) return;

    const [, , guildId, userId] = interaction.customId.split(":");
    if (!guildId || !userId) return;
    if (interaction.user.id !== userId) {
      await interaction.reply(
        ephemeralCard(
          makeWarningCard(
            "Not Your Verification",
            "This verification prompt belongs to another member.",
          ),
        ),
      );
      return;
    }

    const config = await readModuleConfig(
      services,
      guildId,
      ModuleName,
      VerificationConfigSchema,
      ModuleName,
    );
    if (!config.enabled) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Verification Disabled",
            "Verification is not enabled.",
          ),
        ),
      );
      return;
    }

    const pending = await getStoredJson<PendingEntry>(
      redisOf(services),
      pendingKey(guildId, userId),
    );
    if (!pending) {
      await interaction.reply(
        ephemeralCard(
          makeInfoCard(
            "Already Verified",
            "You have already completed verification.",
          ),
        ),
      );
      return;
    }

    const guild =
      interaction.guild ?? services.client.guilds.cache.get(guildId) ?? null;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Missing", "This server is unavailable."),
        ),
      );
      return;
    }
    const member = await fetchMember(guild, userId);
    if (!member) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Member Missing", "You are no longer in this server."),
        ),
      );
      return;
    }

    const granted = await grantVerified(services, member, config);
    if (!granted) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Verification Unavailable",
            "The verified role is not configured or I cannot assign it.",
          ),
        ),
      );
      return;
    }

    await clearPending(services, guildId, userId);
    services.observability?.logger?.info?.("member verified", {
      guildId,
      userId,
    });
    await interaction.reply(
      ephemeralCard(
        makeSuccessCard(
          "Verified",
          "You now have access to the server. Welcome!",
        ),
      ),
    );
  },
};

const verificationSweep: TaskDefinition = {
  name: "verification-sweep",
  cron: "*/1 * * * *",
  async handler(services) {
    const redis = redisOf(services);
    if (!redis) return;

    for (const guild of services.client.guilds.cache.values()) {
      if (!services.modules.isEnabled(guild.id, ModuleName)) continue;
      const config = await readModuleConfig(
        services,
        guild.id,
        ModuleName,
        VerificationConfigSchema,
        ModuleName,
      );
      if (!config.enabled) continue;

      const members = await redis.smembers(pendingSetKey(guild.id));
      for (const userId of members) {
        const pending = await getStoredJson<PendingEntry>(
          redis,
          pendingKey(guild.id, userId),
        );
        if (!pending || pending.expiresAt > Date.now()) continue;

        const member = await fetchMember(guild, userId);
        if (!member) {
          await clearPending(services, guild.id, userId);
          continue;
        }

        if (config.kickOnTimeout) {
          await member.kick("Verification timed out").catch(() => undefined);
        } else if (config.pendingRoleId) {
          await member.roles
            .remove(config.pendingRoleId, "Verification timed out")
            .catch(() => undefined);
        }
        await clearPending(services, guild.id, userId);
        await sendSecurityLog(
          services,
          guild.id,
          securityCard("⌛ Verification Expired", [
            `**Member**\n<@${userId}>`,
            `**Action**\n${config.kickOnTimeout ? "Kicked" : "Pending role removed"}`,
          ]),
        );
      }
    }
  },
};

const verificationCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("verification")
    .setDescription("Manage member verification")
    .addSubcommand((sub) =>
      sub
        .setName("send")
        .setDescription("Send a verification prompt")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Member to verify")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show verification status"),
    ),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    if (!interaction.guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Verification runs per server."),
        ),
      );
      return;
    }
    const config = await readModuleConfig(
      services,
      interaction.guildId,
      ModuleName,
      VerificationConfigSchema,
      ModuleName,
    );
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      const pending = await redisOf(services)?.scard(
        pendingSetKey(interaction.guildId),
      );
      await interaction.reply(
        ephemeralCard(
          makeInfoCard("✅ Verification", [
            `**Status**\n${config.enabled ? "Enabled" : "Disabled"}`,
            `**Mode**\n${config.mode}`,
            `**Target**\n${config.target}`,
            `**Pending members**\n${pending ?? 0}`,
            `**Verified role**\n${config.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : "Not configured"}`,
            `**Timeout**\n${config.timeoutMinutes}m (${config.kickOnTimeout ? "kick" : "remove role"})`,
          ]),
        ),
      );
      return;
    }

    const user = interaction.options.getUser("user", true);
    const guild =
      interaction.guild ??
      services.client.guilds.cache.get(interaction.guildId);
    if (!guild) return;
    const member = await fetchMember(guild, user.id);
    if (!member) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Member Missing", "That user is not in this server."),
        ),
      );
      return;
    }
    await addPending(services, member, config);
    await sendVerification(services, member);
    await interaction.reply(
      ephemeralCard(
        makeSuccessCard(
          "Verification Sent",
          `Sent a verification prompt to <@${member.id}>.`,
        ),
      ),
    );
  },
};

const verificationModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Verification",
  emoji: "✅",
  description:
    "Member verification with emoji captcha, pending/verified roles, and timeout sweep",
  version: "2.0.0",
  config: VerificationConfigSchema,
  commands: [verificationCommand],
  listeners: [
    onMemberAddListener,
    onMemberRemoveListener,
    onInteractionListener,
  ],
  tasks: [verificationSweep],
  async onLoad(_services) {
    console.log(`[${ModuleName}] Module loaded`);
    return [];
  },
  async onUnload() {
    console.log(`[${ModuleName}] Module unloaded`);
  },
});

export default verificationModule;
