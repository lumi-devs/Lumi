import {
  type CommandDefinition,
  defineModule,
  type ModuleDefinition,
  type ModuleServices,
  type TaskDefinition,
} from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { latestBackup, restoreBackup } from "../backup-store.js";
import {
  deleteStored,
  getStoredJson,
  readModuleConfig,
  redisOf,
  securityCard,
  securityKey,
  sendSecurityLog,
} from "../shared.js";

const ModuleName = "security-autorecovery";

const AutoRecoveryConfigSchema = z.object({
  enabled: z.boolean().default(false),
  triggerOnPanic: z.boolean().default(true),
  triggerOnNuke: z.boolean().default(false),
});

type AutoRecoveryConfig = z.infer<typeof AutoRecoveryConfigSchema>;

interface RecoveryFlag {
  reason: "panic" | "nuke";
  at: number;
}

function recoveryKey(guildId: string): string {
  return securityKey("recovery", guildId);
}

function allowed(config: AutoRecoveryConfig, reason: string): boolean {
  if (reason === "panic") return config.triggerOnPanic;
  if (reason === "nuke") return config.triggerOnNuke;
  return false;
}

async function recover(
  services: ModuleServices,
  guildId: string,
): Promise<{ ok: boolean; message: string }> {
  const guild = services.client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, message: "Server unavailable." };
  const latest = await latestBackup(services, guildId);
  if (!latest) {
    return {
      ok: false,
      message: "No backup is available to restore.",
    };
  }
  const result = await restoreBackup(services, guild, latest.data);
  return {
    ok: true,
    message: `Restored ${result.roles} roles and ${result.channels} channels from \`${latest.id}\`.`,
  };
}

const recoveryTask: TaskDefinition = {
  name: "autorecovery",
  cron: "*/1 * * * *",
  async handler(services) {
    for (const guild of services.client.guilds.cache.values()) {
      if (!services.modules.isEnabled(guild.id, ModuleName)) continue;
      const config = await readModuleConfig(
        services,
        guild.id,
        ModuleName,
        AutoRecoveryConfigSchema,
        ModuleName,
      );
      if (!config.enabled) continue;

      const flag = await getStoredJson<RecoveryFlag>(
        redisOf(services),
        recoveryKey(guild.id),
      );
      if (!flag) continue;
      if (!allowed(config, flag.reason)) {
        await deleteStored(redisOf(services), recoveryKey(guild.id));
        continue;
      }

      const result = await recover(services, guild.id);
      await deleteStored(redisOf(services), recoveryKey(guild.id));
      await sendSecurityLog(
        services,
        guild.id,
        securityCard(
          result.ok ? "♻️ Auto Recovery Complete" : "♻️ Auto Recovery Failed",
          [`**Trigger**\n${flag.reason}`, `**Result**\n${result.message}`],
        ),
      );
      services.observability?.logger?.info?.("auto recovery finished", {
        guildId: guild.id,
        reason: flag.reason,
        ok: result.ok,
      });
    }
  },
};

const recoveryCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("recovery")
    .setDescription("Inspect or run automatic recovery")
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show auto recovery status"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("run")
        .setDescription("Restore the latest backup now")
        .addBooleanOption((option) =>
          option
            .setName("confirm")
            .setDescription("Confirm the restore")
            .setRequired(true),
        ),
    ),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    if (!interaction.guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Auto recovery runs per server."),
        ),
      );
      return;
    }
    const config = await readModuleConfig(
      services,
      interaction.guildId,
      ModuleName,
      AutoRecoveryConfigSchema,
      ModuleName,
    );
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      const flag = await getStoredJson<RecoveryFlag>(
        redisOf(services),
        recoveryKey(interaction.guildId),
      );
      await interaction.reply(
        ephemeralCard(
          makeInfoCard("♻️ Auto Recovery", [
            `**Status**\n${config.enabled ? "Enabled" : "Disabled"}`,
            `**On panic**\n${config.triggerOnPanic ? "Restore" : "Ignore"}`,
            `**On nuke**\n${config.triggerOnNuke ? "Restore" : "Ignore"}`,
            `**Pending trigger**\n${flag ? `${flag.reason} (<t:${Math.floor(flag.at / 1000)}:R>)` : "None"}`,
          ]),
        ),
      );
      return;
    }

    const confirmed = interaction.options.getBoolean("confirm", true);
    if (!confirmed) {
      await interaction.reply(
        ephemeralCard(
          makeWarningCard(
            "Recovery Cancelled",
            "Run the command again with `confirm: true` to restore the latest backup.",
          ),
        ),
      );
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await recover(services, interaction.guildId);
    await interaction.editReply(
      ephemeralCard(
        result.ok
          ? makeSuccessCard("Recovery Complete", result.message)
          : makeErrorCard("Recovery Failed", result.message),
      ),
    );
  },
};

const autoRecoveryModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Auto Recovery",
  emoji: "♻️",
  description: "Automatic server restore from latest backup on panic/nuke",
  version: "2.0.0",
  config: AutoRecoveryConfigSchema,
  commands: [recoveryCommand],
  listeners: [],
  tasks: [recoveryTask],
  async onLoad(_services) {
    console.log(`[${ModuleName}] Module loaded`);
    return [];
  },
  async onUnload() {
    console.log(`[${ModuleName}] Module unloaded`);
  },
});

export default autoRecoveryModule;
