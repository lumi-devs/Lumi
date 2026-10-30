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
import {
  createBackup,
  latestBackup,
  listBackups,
  pruneBackups,
  restoreBackup,
} from "../backup-store.js";
import { readModuleConfig, securityCard, sendSecurityLog } from "../shared.js";

const ModuleName = "security-backups";

const BackupsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalHours: z.number().int().min(1).max(168).default(3),
  keepCount: z.number().int().min(1).max(50).default(10),
});

function ageHours(date: Date): number {
  return (Date.now() - date.getTime()) / 3_600_000;
}

const backupTask: TaskDefinition = {
  name: "scheduled-backup",
  cron: "*/1 * * * *",
  async handler(services) {
    for (const guild of services.client.guilds.cache.values()) {
      if (!services.modules.isEnabled(guild.id, ModuleName)) continue;
      const config = await readModuleConfig(
        services,
        guild.id,
        ModuleName,
        BackupsConfigSchema,
        ModuleName,
      );
      if (!config.enabled) continue;

      const latest = await latestBackup(services, guild.id);
      if (latest && ageHours(latest.createdAt) < config.intervalHours) continue;

      const created = await createBackup(services, guild, "scheduled");
      if (!created) continue;
      await pruneBackups(services, guild.id, config.keepCount);
      await sendSecurityLog(
        services,
        guild.id,
        securityCard("💾 Backup Created", [
          `**Reason**\nScheduled (${config.intervalHours}h interval)`,
          `**Backup**\n\`${created.id}\``,
          `**Roles**\n${created.data.roles.length}`,
          `**Channels**\n${created.data.channels.length}`,
        ]),
      );
    }
  },
};

async function performBackup(
  services: ModuleServices,
  guildId: string,
  reason: string,
): Promise<string | null> {
  const guild = services.client.guilds.cache.get(guildId);
  if (!guild) return null;
  const config = await readModuleConfig(
    services,
    guildId,
    ModuleName,
    BackupsConfigSchema,
    ModuleName,
  );
  const created = await createBackup(services, guild, reason);
  if (!created) return null;
  await pruneBackups(services, guildId, config.keepCount);
  return created.id;
}

const backupCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Create, list, or restore server structure backups")
    .addSubcommand((sub) =>
      sub.setName("create").setDescription("Create a backup now"),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List recent backups"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("restore")
        .setDescription("Restore the latest backup")
        .addBooleanOption((option) =>
          option
            .setName("confirm")
            .setDescription("Confirm restoring missing roles and channels")
            .setRequired(true),
        ),
    ),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    if (!interaction.guildId) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Server Only", "Backups are per server.")),
      );
      return;
    }
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const id = await performBackup(
        services,
        guildId,
        `manual:${interaction.user.id}`,
      );
      await interaction.editReply(
        id
          ? ephemeralCard(
              makeSuccessCard("Backup Created", `Backup ID: \`${id}\``),
            )
          : ephemeralCard(
              makeErrorCard(
                "Backup Failed",
                "The backup could not be stored. Check database access.",
              ),
            ),
      );
      return;
    }

    if (sub === "list") {
      const backups = await listBackups(services, guildId, 10);
      await interaction.reply(
        ephemeralCard(
          makeInfoCard(
            "💾 Backups",
            backups.length === 0
              ? ["No backups stored yet."]
              : backups.map(
                  (backup) =>
                    `• \`${backup.id}\` — <t:${Math.floor(backup.createdAt.getTime() / 1000)}:R> (${backup.reason})`,
                ),
          ),
        ),
      );
      return;
    }

    const confirmed = interaction.options.getBoolean("confirm", true);
    if (!confirmed) {
      await interaction.reply(
        ephemeralCard(
          makeWarningCard(
            "Restore Cancelled",
            "Run the command again with `confirm: true` to restore missing roles and channels.",
          ),
        ),
      );
      return;
    }

    const latest = await latestBackup(services, guildId);
    if (!latest) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "No Backup",
            "There is no backup to restore. Create one first.",
          ),
        ),
      );
      return;
    }

    const guild = interaction.guild;
    if (!guild) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await restoreBackup(services, guild, latest.data);
    await interaction.editReply(
      ephemeralCard(
        makeSuccessCard("Backup Restored", [
          `**Backup**\n\`${latest.id}\``,
          `**Roles created**\n${result.roles}`,
          `**Channels created**\n${result.channels}`,
        ]),
      ),
    );
    await sendSecurityLog(
      services,
      guildId,
      securityCard("💾 Backup Restored", [
        `**By**\n<@${interaction.user.id}>`,
        `**Backup**\n\`${latest.id}\``,
        `**Roles**\n${result.roles}`,
        `**Channels**\n${result.channels}`,
      ]),
    );
  },
};

const backupsModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Backups",
  emoji: "💾",
  description: "Periodic server structure snapshots for auto-recovery",
  version: "2.0.0",
  config: BackupsConfigSchema,
  commands: [backupCommand],
  listeners: [],
  tasks: [backupTask],
  async onLoad(_services) {
    console.log(`[${ModuleName}] Module loaded`);
    return [];
  },
  async onUnload() {
    console.log(`[${ModuleName}] Module unloaded`);
  },
});

export default backupsModule;
