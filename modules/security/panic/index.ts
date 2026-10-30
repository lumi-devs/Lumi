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
import {
  getStoredJson,
  incrementWindow,
  readModuleConfig,
  redisOf,
  securityCard,
  securityKey,
  sendSecurityLog,
  setStoredJson,
} from "../shared.js";
import { endPanic, getPanic, panicKey, startPanic } from "./state.js";

const ModuleName = "security-panic";

const PanicConfigSchema = z.object({
  enabled: z.boolean().default(false),
  burstLimit: z.number().int().min(1).max(20).default(3),
  burstWindowSeconds: z.number().int().min(1).max(10).default(2),
  durationMinutes: z.number().int().min(1).max(1440).default(30),
  notifyOwners: z.boolean().default(true),
  lockModCommands: z.boolean().default(false),
});

type PanicConfig = z.infer<typeof PanicConfigSchema>;

const DestructiveActions = new Set<AuditLogEvent>([
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberKick,
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.RoleDelete,
]);

async function notifyOwner(
  services: ModuleServices,
  guild: Guild,
  lines: string[],
): Promise<void> {
  const owner = await services.client.users
    .fetch(guild.ownerId)
    .catch(() => null);
  if (!owner) return;
  await owner
    .send(cardCreateOptions(securityCard("🚨 Panic Mode", lines)))
    .catch(() => undefined);
}

async function triggerPanic(
  services: ModuleServices,
  guild: Guild,
  config: PanicConfig,
  reason: string,
  by: string,
): Promise<void> {
  if (await getPanic(services, guild.id)) return;
  const state = await startPanic(
    services,
    guild.id,
    config.durationMinutes,
    reason,
    by,
    config.lockModCommands,
  );
  await setStoredJson(
    redisOf(services),
    securityKey("recovery", guild.id),
    { reason: "panic", at: Date.now() },
    config.durationMinutes * 60,
  );
  await sendSecurityLog(
    services,
    guild.id,
    securityCard("🚨 Panic Mode Engaged", [
      `**Reason**\n${reason}`,
      `**By**\n${by}`,
      `**Until**\n<t:${Math.floor(state.until / 1000)}:R>`,
      `**Mod commands**\n${config.lockModCommands ? "Locked" : "Unlocked"}`,
    ]),
  );
  if (config.notifyOwners) {
    await notifyOwner(services, guild, [
      `**Server**\n${guild.name}`,
      `**Reason**\n${reason}`,
      `**Until**\n<t:${Math.floor(state.until / 1000)}:R>`,
    ]);
  }
}

const onAuditLogListener: ListenerDefinition = {
  event: "guildAuditLogEntryCreate",
  async handler(
    entry: GuildAuditLogsEntry,
    guild: Guild,
    services: ModuleServices,
  ) {
    if (!DestructiveActions.has(entry.action)) return;
    const config = await readModuleConfig(
      services,
      guild.id,
      ModuleName,
      PanicConfigSchema,
      ModuleName,
    );
    if (!config.enabled) return;

    const count = await incrementWindow(
      redisOf(services),
      securityKey("panic", "burst", guild.id),
      config.burstWindowSeconds,
    );
    if (count < config.burstLimit) return;

    await triggerPanic(
      services,
      guild,
      config,
      `Threat velocity: ${count} destructive actions in ${config.burstWindowSeconds}s`,
      services.client.user?.id ?? "panic",
    );
  },
};

const panicExpiryTask: TaskDefinition = {
  name: "panic-expiry",
  cron: "*/1 * * * *",
  async handler(services) {
    for (const guild of services.client.guilds.cache.values()) {
      if (!services.modules.isEnabled(guild.id, ModuleName)) continue;
      const state = await getStoredJson<{ until: number }>(
        redisOf(services),
        panicKey(guild.id),
      );
      if (!state || state.until > Date.now()) continue;
      await endPanic(services, guild.id);
      await sendSecurityLog(
        services,
        guild.id,
        securityCard("🚨 Panic Mode Lifted", [`**Reason**\nTimer expired`]),
      );
    }
  },
};

const panicCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("panic")
    .setDescription("Control server panic mode")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Engage panic mode")
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Why panic mode is starting")
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName("minutes")
            .setDescription("Duration in minutes")
            .setMinValue(1)
            .setMaxValue(1440)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("end").setDescription("Lift panic mode"),
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show panic mode status"),
    ),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    if (!interaction.guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Panic mode runs per server."),
        ),
      );
      return;
    }
    const guild = interaction.guild;
    if (!guild) return;
    const config = await readModuleConfig(
      services,
      guild.id,
      ModuleName,
      PanicConfigSchema,
      ModuleName,
    );
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      const state = await getPanic(services, guild.id);
      await interaction.reply(
        ephemeralCard(
          makeInfoCard("🚨 Panic Mode", [
            `**Status**\n${state ? "Active" : "Inactive"}`,
            `**Reason**\n${state?.reason ?? "None"}`,
            `**Until**\n${state ? `<t:${Math.floor(state.until / 1000)}:R>` : "—"}`,
            `**Mod commands**\n${config.lockModCommands ? "Locked during panic" : "Unlocked"}`,
          ]),
        ),
      );
      return;
    }

    if (sub === "end") {
      await endPanic(services, guild.id);
      await sendSecurityLog(
        services,
        guild.id,
        securityCard("🚨 Panic Mode Lifted", [
          `**By**\n<@${interaction.user.id}>`,
        ]),
      );
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Panic Mode Lifted", "Normal operations resumed."),
        ),
      );
      return;
    }

    if (!config.enabled) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Panic Disabled",
            "Enable the panic submodule in the security panel first.",
          ),
        ),
      );
      return;
    }

    const minutes =
      interaction.options.getInteger("minutes") ?? config.durationMinutes;
    const reason =
      interaction.options.getString("reason") ?? "Manual activation";
    await triggerPanic(
      services,
      guild,
      { ...config, durationMinutes: minutes },
      reason,
      `<@${interaction.user.id}>`,
    );
    const remaining = await getStoredJson<{ until: number }>(
      redisOf(services),
      panicKey(guild.id),
    );
    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Panic Mode Engaged", [
          `**Reason**\n${reason}`,
          `**Until**\n${remaining ? `<t:${Math.floor(remaining.until / 1000)}:R>` : `${minutes}m`}`,
          `**Mod commands**\n${config.lockModCommands ? "Locked" : "Unlocked"}`,
        ]),
      ),
    );
  },
};

const panicModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Panic Mode",
  emoji: "🚨",
  description: "Automated server lockdown on threat velocity spikes",
  version: "2.0.0",
  config: PanicConfigSchema,
  commands: [panicCommand],
  listeners: [onAuditLogListener],
  tasks: [panicExpiryTask],
  async onLoad(_services) {
    console.log(`[${ModuleName}] Module loaded`);
    return [];
  },
  async onUnload() {
    console.log(`[${ModuleName}] Module unloaded`);
  },
});

export default panicModule;
