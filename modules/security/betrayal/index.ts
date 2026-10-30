import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "@lumi/ui";
import {
  AuditLogEvent,
  type Guild,
  type GuildAuditLogsEntry,
  SlashCommandBuilder,
} from "discord.js";
import { z } from "zod";
import { getSecurityConfig } from "../config.js";
import {
  deleteStored,
  fetchMember,
  getStoredJson,
  incrementWindow,
  isTrusted,
  readModuleConfig,
  redisOf,
  securityCard,
  securityKey,
  sendSecurityLog,
  setStoredJson,
} from "../shared.js";

const ModuleName = "security-betrayal";

const BetrayalConfigSchema = z.object({
  enabled: z.boolean().default(false),
  defaultMinuteLimit: z.number().int().min(1).max(100).default(8),
  defaultHourLimit: z.number().int().min(1).max(1000).default(40),
  actions: z
    .record(
      z.string(),
      z.object({
        minuteLimit: z.number().int().min(1).max(100).optional(),
        hourLimit: z.number().int().min(1).max(1000).optional(),
      }),
    )
    .default({}),
});

type BetrayalConfig = z.infer<typeof BetrayalConfigSchema>;

interface BetrayerState {
  action: string;
  minuteCount: number;
  hourCount: number;
  at: number;
}

const ActionNames: Partial<Record<AuditLogEvent, string>> = {
  [AuditLogEvent.MemberBanAdd]: "ban",
  [AuditLogEvent.MemberKick]: "kick",
  [AuditLogEvent.ChannelDelete]: "channel-delete",
  [AuditLogEvent.RoleDelete]: "role-delete",
  [AuditLogEvent.WebhookCreate]: "webhook-create",
};

function betrayerKey(guildId: string, userId: string): string {
  return securityKey("betrayal", guildId, userId);
}

function betrayerSetKey(guildId: string): string {
  return securityKey("betrayal", "set", guildId);
}

function limits(config: BetrayalConfig, action: string) {
  const override = config.actions[action];
  return {
    minute: override?.minuteLimit ?? config.defaultMinuteLimit,
    hour: override?.hourLimit ?? config.defaultHourLimit,
  };
}

const onAuditLogListener: ListenerDefinition = {
  event: "guildAuditLogEntryCreate",
  async handler(
    entry: GuildAuditLogsEntry,
    guild: Guild,
    services: ModuleServices,
  ) {
    const action = ActionNames[entry.action];
    if (!action) return;
    const executorId = entry.executorId;
    if (!executorId || executorId === guild.ownerId) return;
    if (executorId === services.client.user?.id) return;

    const config = await readModuleConfig(
      services,
      guild.id,
      ModuleName,
      BetrayalConfigSchema,
      ModuleName,
    );
    if (!config.enabled) return;

    const security = await getSecurityConfig(services, guild.id);
    const member = await fetchMember(guild, executorId);
    if (!member) return;
    if (!isTrusted(member, guild, security)) return;
    if (
      await getStoredJson(redisOf(services), betrayerKey(guild.id, executorId))
    ) {
      return;
    }

    const redis = redisOf(services);
    const minuteCount = await incrementWindow(
      redis,
      securityKey("betrayal", "minute", guild.id, executorId, action),
      60,
    );
    const hourCount = await incrementWindow(
      redis,
      securityKey("betrayal", "hour", guild.id, executorId, action),
      3600,
    );
    const limit = limits(config, action);
    if (minuteCount <= limit.minute && hourCount <= limit.hour) return;

    const state: BetrayerState = {
      action,
      minuteCount,
      hourCount,
      at: Date.now(),
    };
    await setStoredJson(redis, betrayerKey(guild.id, executorId), state, 3600);
    if (redis) await redis.sadd(betrayerSetKey(guild.id), executorId);

    const revoked = security.trustedRoleIds.filter((roleId) =>
      member.roles.cache.has(roleId),
    );
    if (revoked.length > 0) {
      await member.roles
        .remove(revoked, "Betrayal guard: immunity revoked")
        .catch(() => undefined);
    }

    services.observability?.logger?.warn?.("betrayal detected", {
      guildId: guild.id,
      userId: executorId,
      action,
      minuteCount,
      hourCount,
    });
    await sendSecurityLog(
      services,
      guild.id,
      securityCard("🔍 Betrayal Detected", [
        `**Member**\n<@${executorId}> (\`${executorId}\`)`,
        `**Action**\n${action}`,
        `**Velocity**\n${minuteCount}/min · ${hourCount}/hour`,
        `**Limits**\n${limit.minute}/min · ${limit.hour}/hour`,
        `**Trusted roles revoked**\n${revoked.length > 0 ? revoked.map((id) => `<@&${id}>`).join(", ") : "None"}`,
      ]),
    );
  },
};

const betrayalCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("betrayal")
    .setDescription("Inspect bypass abuse monitoring")
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show monitored betrayers"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Reset a member's betrayer status")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Member to reset")
            .setRequired(true),
        ),
    ),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    if (!interaction.guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Betrayal guard runs per server."),
        ),
      );
      return;
    }
    const config = await readModuleConfig(
      services,
      interaction.guildId,
      ModuleName,
      BetrayalConfigSchema,
      ModuleName,
    );
    const sub = interaction.options.getSubcommand();

    if (sub === "reset") {
      const user = interaction.options.getUser("user", true);
      await deleteStored(
        redisOf(services),
        betrayerKey(interaction.guildId, user.id),
      );
      await redisOf(services)?.srem(
        betrayerSetKey(interaction.guildId),
        user.id,
      );
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard(
            "Betrayer Reset",
            `Cleared betrayer status for <@${user.id}>.`,
          ),
        ),
      );
      return;
    }

    const ids =
      (await redisOf(services)?.smembers(
        betrayerSetKey(interaction.guildId),
      )) ?? [];
    await interaction.reply(
      ephemeralCard(
        makeInfoCard("🔍 Betrayal Guard", [
          `**Status**\n${config.enabled ? "Enabled" : "Disabled"}`,
          `**Default limits**\n${config.defaultMinuteLimit}/min · ${config.defaultHourLimit}/hour`,
          `**Flagged members**\n${ids.length === 0 ? "None" : ids.map((id) => `<@${id}>`).join(", ")}`,
        ]),
      ),
    );
  },
};

const betrayalModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Betrayal Guard",
  emoji: "🔍",
  description:
    "Velocity monitoring of whitelisted users with automatic immunity revocation",
  version: "2.0.0",
  config: BetrayalConfigSchema,
  commands: [betrayalCommand],
  listeners: [onAuditLogListener],
  tasks: [],
  async onLoad(_services) {
    console.log(`[${ModuleName}] Module loaded`);
    return [];
  },
  async onUnload() {
    console.log(`[${ModuleName}] Module unloaded`);
  },
});

export default betrayalModule;
