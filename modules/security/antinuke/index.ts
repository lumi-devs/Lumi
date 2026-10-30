import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeInfoCard } from "@lumi/ui";
import {
  AuditLogEvent,
  type Guild,
  type GuildAuditLogsEntry,
  SlashCommandBuilder,
} from "discord.js";
import { z } from "zod";
import { getSecurityConfig } from "../config.js";
import {
  applyResponse,
  fetchMember,
  hasPermit,
  incrementWindow,
  isTrusted,
  readModuleConfig,
  redisOf,
  type SecurityResponse,
  securityCard,
  securityKey,
  sendSecurityLog,
  setStoredJson,
} from "../shared.js";

const ModuleName = "security-antinuke";

const AntiNukeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  windowSeconds: z.number().int().min(10).max(600).default(60),
  maxBans: z.number().int().min(1).max(50).default(5),
  responseBans: z.enum(["log", "quarantine", "ban"]).default("quarantine"),
  maxKicks: z.number().int().min(1).max(50).default(5),
  responseKicks: z.enum(["log", "quarantine", "ban"]).default("quarantine"),
  maxChannelDeletes: z.number().int().min(1).max(50).default(3),
  responseChannelDeletes: z
    .enum(["log", "quarantine", "ban"])
    .default("quarantine"),
  maxRoleDeletes: z.number().int().min(1).max(50).default(3),
  responseRoleDeletes: z
    .enum(["log", "quarantine", "ban"])
    .default("quarantine"),
  maxWebhookCreates: z.number().int().min(1).max(50).default(3),
  responseWebhookCreates: z
    .enum(["log", "quarantine", "ban"])
    .default("quarantine"),
  maxVanityChanges: z.number().int().min(1).max(10).default(1),
  maxPermissionGrants: z.number().int().min(1).max(10).default(1),
  maxQuarantineBypass: z.number().int().min(1).max(10).default(1),
});

type AntiNukeConfig = z.infer<typeof AntiNukeConfigSchema>;

interface Guard {
  action: string;
  max: number;
  response: SecurityResponse;
}

function guardFor(
  entry: GuildAuditLogsEntry,
  guild: Guild,
  config: AntiNukeConfig,
  targetMember: Awaited<ReturnType<typeof fetchMember>>,
  securityQuarantineRoleId: string | null,
): Guard | null {
  switch (entry.action) {
    case AuditLogEvent.MemberBanAdd:
      return {
        action: "ban",
        max: config.maxBans,
        response: config.responseBans,
      };
    case AuditLogEvent.MemberKick:
      return {
        action: "kick",
        max: config.maxKicks,
        response: config.responseKicks,
      };
    case AuditLogEvent.ChannelDelete:
      return {
        action: "channel-delete",
        max: config.maxChannelDeletes,
        response: config.responseChannelDeletes,
      };
    case AuditLogEvent.RoleDelete:
      return {
        action: "role-delete",
        max: config.maxRoleDeletes,
        response: config.responseRoleDeletes,
      };
    case AuditLogEvent.WebhookCreate:
      return {
        action: "webhook-create",
        max: config.maxWebhookCreates,
        response: config.responseWebhookCreates,
      };
    case AuditLogEvent.GuildUpdate: {
      const vanity = entry.changes.some(
        (change) => change.key === "vanity_url_code",
      );
      return vanity
        ? { action: "vanity", max: config.maxVanityChanges, response: "log" }
        : null;
    }
    case AuditLogEvent.RoleUpdate: {
      if (entry.targetId !== guild.id) return null;
      const permissions = entry.changes.some(
        (change) => change.key === "permissions",
      );
      return permissions
        ? {
            action: "permission-grant",
            max: config.maxPermissionGrants,
            response: "log",
          }
        : null;
    }
    case AuditLogEvent.MemberRoleUpdate: {
      if (!securityQuarantineRoleId) return null;
      if (!targetMember?.roles.cache.has(securityQuarantineRoleId)) return null;
      return {
        action: "quarantine-bypass",
        max: config.maxQuarantineBypass,
        response: "log",
      };
    }
    default:
      return null;
  }
}

const onAuditLogListener: ListenerDefinition = {
  event: "guildAuditLogEntryCreate",
  async handler(
    entry: GuildAuditLogsEntry,
    guild: Guild,
    services: ModuleServices,
  ) {
    const config = await readModuleConfig(
      services,
      guild.id,
      ModuleName,
      AntiNukeConfigSchema,
      ModuleName,
    );
    if (!config.enabled) return;

    const executorId = entry.executorId;
    if (!executorId) return;
    if (executorId === services.client.user?.id) return;
    if (executorId === guild.ownerId) return;

    const security = await getSecurityConfig(services, guild.id);
    const executor = await fetchMember(guild, executorId);
    if (!executor) return;
    if (isTrusted(executor, guild, security)) return;
    if (
      await hasPermit(services, guild, executor, "security.antinuke.bypass")
    ) {
      return;
    }

    const targetMember =
      entry.action === AuditLogEvent.MemberRoleUpdate && entry.targetId
        ? await fetchMember(guild, entry.targetId)
        : null;
    const guard = guardFor(
      entry,
      guild,
      config,
      targetMember,
      security.quarantineRoleId,
    );
    if (!guard) return;

    const redis = redisOf(services);
    const windowKey = securityKey(
      "antinuke",
      guild.id,
      guard.action,
      executorId,
    );
    const count = await incrementWindow(redis, windowKey, config.windowSeconds);
    if (count <= guard.max) return;

    const triggeredKey = securityKey(
      "antinuke",
      guild.id,
      guard.action,
      executorId,
      "triggered",
    );
    if (
      redis &&
      !(await redis.set(triggeredKey, "1", "EX", config.windowSeconds, "NX"))
    ) {
      return;
    }

    const outcome = await applyResponse(
      services,
      guild,
      security,
      executorId,
      guard.response,
      `Anti-nuke: ${guard.action} threshold exceeded`,
    );

    await setStoredJson(
      redis,
      securityKey("recovery", guild.id),
      { reason: "nuke", at: Date.now() },
      config.windowSeconds * 10,
    );

    services.observability?.logger?.warn?.("anti-nuke threshold exceeded", {
      guildId: guild.id,
      executorId,
      action: guard.action,
      count,
      outcome,
    });

    await sendSecurityLog(
      services,
      guild.id,
      securityCard("☢️ Anti-Nuke Triggered", [
        `**Executor**\n<@${executorId}> (\`${executorId}\`)`,
        `**Action**\n${guard.action}`,
        `**Count**\n${count} in ${config.windowSeconds}s`,
        `**Response**\n${outcome}`,
      ]),
    );
  },
};

const antinukeCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("Show anti-nuke thresholds and status"),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    if (!interaction.guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Anti-nuke status is per server."),
        ),
      );
      return;
    }
    const config = await readModuleConfig(
      services,
      interaction.guildId,
      ModuleName,
      AntiNukeConfigSchema,
      ModuleName,
    );
    const security = await getSecurityConfig(services, interaction.guildId);
    await interaction.reply(
      ephemeralCard(
        makeInfoCard("☢️ Anti-Nuke", [
          `**Status**\n${config.enabled ? "Enabled" : "Disabled"}`,
          `**Window**\n${config.windowSeconds}s`,
          `**Bans**\n${config.maxBans} → ${config.responseBans}`,
          `**Kicks**\n${config.maxKicks} → ${config.responseKicks}`,
          `**Channel deletes**\n${config.maxChannelDeletes} → ${config.responseChannelDeletes}`,
          `**Role deletes**\n${config.maxRoleDeletes} → ${config.responseRoleDeletes}`,
          `**Webhook creates**\n${config.maxWebhookCreates} → ${config.responseWebhookCreates}`,
          `**Quarantine role**\n${security.quarantineRoleId ? `<@&${security.quarantineRoleId}>` : "Not configured"}`,
        ]),
      ),
    );
  },
};

const antiNukeModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Anti-Nuke",
  emoji: "☢️",
  description:
    "Anti-nuke detection with sliding windows, quarantine/ban responses, and trusted role exemptions",
  version: "2.0.0",
  config: AntiNukeConfigSchema,
  commands: [antinukeCommand],
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

export default antiNukeModule;
