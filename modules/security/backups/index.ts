import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
  type TaskDefinition,
} from "@lumi/module-kit";
import {
  createActionButton,
  ephemeralCard,
  fitLines,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  row,
} from "@lumi/ui";
import {
  type ButtonInteraction,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { z } from "zod";
import {
  type BackupDiff,
  type BackupRecord,
  backupById,
  backupStats,
  createBackup,
  latestBackup,
  listBackups,
  previewBackupRestore,
  pruneBackups,
  restoreBackup,
} from "../../shared/backup-store/index.js";
import {
  hasPermit,
  readModuleConfig,
  securityCard,
  sendSecurityLog,
} from "../../shared/security.js";

const ModuleName = "security-backups";
const ButtonPrefix = "lumi:backup";

const BackupsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalHours: z.number().int().min(1).max(168).default(3),
  keepCount: z.number().int().min(1).max(50).default(10),
});

function ageHours(date: Date): number {
  return (Date.now() - date.getTime()) / 3_600_000;
}

function statsLine(backup: BackupRecord): string {
  const stats = backupStats(backup.data);
  const parts = [
    `${stats.roles} roles`,
    `${stats.channels} channels`,
    `${stats.categories} categories`,
    `${stats.text} text`,
  ];
  if (stats.voice > 0) parts.push(`${stats.voice} voice`);
  if (stats.stages > 0) parts.push(`${stats.stages} stage`);
  if (stats.forums > 0) parts.push(`${stats.forums} forum`);
  if (stats.media > 0) parts.push(`${stats.media} media`);
  if (stats.announcements > 0) parts.push(`${stats.announcements} ann.`);
  parts.push(`${stats.overwrites} overwrites`);
  return parts.join(" · ");
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
          `**Contents**\n${statsLine(created)}`,
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

function diffLines(diff: BackupDiff): string {
  const lines: string[] = [];
  const roleCreates = diff.roles.filter(
    (change) => change.action === "create",
  ).length;
  const roleUpdates = diff.roles.length - roleCreates;
  const channelCreates = diff.channels.filter(
    (change) => change.action === "create",
  ).length;
  const channelUpdates = diff.channels.length - channelCreates;

  lines.push(
    `**Roles**\n${roleCreates} create · ${roleUpdates} update · ${diff.unchangedRoles} unchanged`,
  );
  for (const change of diff.roles.slice(0, 10)) {
    lines.push(
      `• ${change.action === "create" ? "Create" : "Update"} **${change.name}**${change.fields.length > 0 ? ` (${change.fields.join(", ")})` : ""}`,
    );
  }
  if (diff.roles.length > 10) {
    lines.push(`-# ...and ${diff.roles.length - 10} more role change(s).`);
  }

  lines.push(
    `**Channels**\n${channelCreates} create · ${channelUpdates} update · ${diff.unchangedChannels} unchanged`,
  );
  for (const change of diff.channels.slice(0, 10)) {
    lines.push(
      `• ${change.action === "create" ? "Create" : "Update"} **${change.name}**${change.fields.length > 0 ? ` (${change.fields.join(", ")})` : ""}`,
    );
  }
  if (diff.channels.length > 10) {
    lines.push(
      `-# ...and ${diff.channels.length - 10} more channel change(s).`,
    );
  }

  if (diff.warnings.length > 0) {
    lines.push(`**Warnings**`);
    for (const warning of diff.warnings.slice(0, 5)) {
      lines.push(`-# ${warning}`);
    }
    if (diff.warnings.length > 5) {
      lines.push(`-# ...and ${diff.warnings.length - 5} more warning(s).`);
    }
  }

  return fitLines(lines, 3000);
}

function restorePreviewCard(
  backup: BackupRecord,
  diff: BackupDiff,
  userId: string,
) {
  return makeWarningCard(
    "💾 Restore Preview",
    [
      `**Backup**\n\`${backup.id}\` · <t:${Math.floor(backup.createdAt.getTime() / 1000)}:R>`,
      `**Contents**\n${statsLine(backup)}`,
      diffLines(diff),
      "-# Existing roles and channels are updated in place. Nothing is deleted.",
    ],
    {
      actionRows: [
        row(
          createActionButton({
            customId: `${ButtonPrefix}:confirm:${backup.id}:${userId}`,
            label: "Confirm Restore",
            style: ButtonStyle.Danger,
          }),
          createActionButton({
            customId: `${ButtonPrefix}:cancel:${backup.id}:${userId}`,
            label: "Reject",
            style: ButtonStyle.Secondary,
          }),
        ),
      ],
    },
  );
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
        .setDescription("Preview and restore a backup")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("Backup ID (defaults to the latest backup)")
            .setRequired(false),
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
      const lines =
        backups.length === 0
          ? ["No backups stored yet."]
          : backups.map(
              (backup) =>
                `• \`${backup.id}\` — <t:${Math.floor(backup.createdAt.getTime() / 1000)}:R> (${backup.reason})\n-# ${statsLine(backup)}`,
            );
      await interaction.reply(ephemeralCard(makeInfoCard("💾 Backups", lines)));
      return;
    }

    const guild = interaction.guild;
    if (!guild) return;
    const requestedId = interaction.options.getString("id");
    const backup = requestedId
      ? await backupById(services, guildId, requestedId)
      : await latestBackup(services, guildId);
    if (!backup) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "No Backup",
            requestedId
              ? `No backup with ID \`${requestedId}\` exists for this server.`
              : "There is no backup to restore. Create one first.",
          ),
        ),
      );
      return;
    }

    const diff = previewBackupRestore(guild, backup.data);
    await interaction.reply(
      ephemeralCard(restorePreviewCard(backup, diff, interaction.user.id)),
    );
  },
};

const restoreButtonListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: ButtonInteraction, services: ModuleServices) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(`${ButtonPrefix}:`)) return;

    const [, , action, backupId, userId] = interaction.customId.split(":");
    if (!action || !backupId || !userId) return;

    if (interaction.user.id !== userId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Preview",
            "Run `/backup restore` to preview and restore this backup.",
          ),
        ),
      );
      return;
    }

    const guildId = interaction.guildId;
    const guild = interaction.guild;
    if (!guildId || !guild) return;

    if (action === "cancel") {
      await interaction.update(
        ephemeralCard(
          makeWarningCard(
            "Restore Rejected",
            "No roles or channels were changed.",
          ),
        ),
      );
      return;
    }

    if (action !== "confirm") return;

    if (!services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Backups Disabled",
            "The backups module is not enabled for this server.",
          ),
        ),
      );
      return;
    }

    const member = await guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (
      !member ||
      !(await hasPermit(services, guild, member, "admin.config"))
    ) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permission",
            "You no longer have permission to restore backups.",
          ),
        ),
      );
      return;
    }

    await interaction.deferUpdate();
    const backup = await backupById(services, guildId, backupId);
    if (!backup) {
      await interaction.editReply(
        ephemeralCard(
          makeErrorCard("Backup Missing", `No backup with ID \`${backupId}\`.`),
        ),
      );
      return;
    }

    const result = await restoreBackup(services, guild, backup.data);
    const lines = [
      `**Backup**\n\`${backup.id}\``,
      `**Roles**\n${result.rolesCreated} created · ${result.rolesUpdated} updated`,
      `**Channels**\n${result.channelsCreated} created · ${result.channelsUpdated} updated`,
    ];
    if (result.warnings.length > 0) {
      lines.push(
        `**Warnings**\n${fitLines(
          result.warnings.map((warning) => `-# ${warning}`),
          1500,
        )}`,
      );
    }

    await interaction.editReply(
      ephemeralCard(
        result.aborted
          ? makeErrorCard("Backup Restore Aborted", lines)
          : result.warnings.length > 0
            ? makeWarningCard("Backup Restored with Warnings", lines)
            : makeSuccessCard("Backup Restored", lines),
      ),
    );
    await sendSecurityLog(
      services,
      guildId,
      securityCard(
        result.aborted
          ? "💾 Backup Restore Aborted"
          : result.warnings.length > 0
            ? "💾 Backup Restored with Warnings"
            : "💾 Backup Restored",
        [
          `**By**\n<@${interaction.user.id}>`,
          `**Backup**\n\`${backup.id}\``,
          `**Roles**\n${result.rolesCreated} created · ${result.rolesUpdated} updated`,
          `**Channels**\n${result.channelsCreated} created · ${result.channelsUpdated} updated`,
          ...(result.warnings.length > 0
            ? [
                `**Warnings**\n${fitLines(
                  result.warnings.map((warning) => `-# ${warning}`),
                  1500,
                )}`,
              ]
            : []),
        ],
      ),
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
  listeners: [restoreButtonListener],
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
