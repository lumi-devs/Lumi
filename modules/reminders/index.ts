import { requireGuildId as guildIdOf } from "@lumi/foundation";
import {
  type CommandDefinition,
  defineModule,
  type ModuleDefinition,
  type ModuleServices,
  type TaskDefinition,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeWarningCard } from "@lumi/ui";
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { GuildBasedChannel } from "discord.js";
import { cleanupDeliveredReminders } from "./cleanup.js";
import {
  ModuleName,
  readReminderConfig,
  ReminderConfigSchema,
} from "./config.js";
import type { ReminderConfig } from "./config.js";
import { isValidCron } from "./cron.js";
import { deliverDueReminders } from "./delivery.js";
import { DurationParseError, parseDuration } from "./duration.js";
import { canCreateReminder } from "./policy.js";
import {
  cancelUserReminder,
  clearUserReminders,
  countActiveReminders,
  createReminder,
  listActiveReminders,
  resolveUserReminder,
  snoozeUserReminder,
} from "./store.js";
import {
  reminderCancelledCard,
  reminderClearedCard,
  reminderCreatedCard,
  reminderListCard,
  reminderSnoozedCard,
  truncateReminderMessage,
} from "./ui.js";

const MaxReminderTextLength = 1500;

async function requireReady(
  interaction: Parameters<CommandDefinition["execute"]>[0],
  services: ModuleServices,
): Promise<{ guildId: string; config: ReminderConfig } | null> {
  const guildId = guildIdOf(interaction.guildId);
  if (!guildId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Server Only", "Reminders can only be used in a server."),
      ),
    );
    return null;
  }
  if (!services.modules.isEnabled(guildId, ModuleName)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Module Disabled",
          `The **${ModuleName}** module is disabled on this server.`,
        ),
      ),
    );
    return null;
  }
  const config = await readReminderConfig(services, guildId);
  if (!config.enabled) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Reminders Disabled",
          "Reminders are disabled on this server.",
        ),
      ),
    );
    return null;
  }
  return { guildId, config };
}

async function validateChannel(
  interaction: Parameters<CommandDefinition["execute"]>[0],
  channel: GuildBasedChannel | null,
): Promise<boolean> {
  if (!channel?.isTextBased()) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Invalid Channel",
          "Choose a text channel for reminder fallback.",
        ),
      ),
    );
    return false;
  }
  const me = interaction.guild?.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (
    permissions &&
    !permissions.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ])
  ) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Missing Permissions",
          `I need **View Channel** and **Send Messages** in <#${channel.id}>.`,
        ),
      ),
    );
    return false;
  }
  return true;
}

const remindCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Create and manage personal reminders")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Set a reminder")
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("When to remind you, for example 10m, 2h, or 1h30m")
            .setRequired(true)
            .setMaxLength(32),
        )
        .addStringOption((option) =>
          option
            .setName("text")
            .setDescription("What to remind you about")
            .setRequired(true)
            .setMaxLength(MaxReminderTextLength),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to use if direct messages fail")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.PublicThread,
              ChannelType.PrivateThread,
            )
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("repeat")
            .setDescription(
              "Optional UTC cron expression for a recurring reminder",
            )
            .setRequired(false)
            .setMaxLength(100),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List your active reminders"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Cancel one of your reminders")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("Reminder ID shown by /remind list")
            .setRequired(true)
            .setMaxLength(64),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Cancel all of your active reminders")
        .addBooleanOption((option) =>
          option
            .setName("confirm")
            .setDescription("Confirm cancelling every active reminder")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("snooze")
        .setDescription("Delay one of your reminders")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("Reminder ID shown by /remind list")
            .setRequired(true)
            .setMaxLength(64),
        )
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("How long to snooze, for example 15m or 2h")
            .setRequired(true)
            .setMaxLength(32),
        ),
    ),
  aliases: ["reminders"],
  async execute(interaction, services) {
    const ready = await requireReady(interaction, services);
    if (!ready) return;

    const { guildId, config } = ready;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      const durationInput = interaction.options.getString("duration", true);
      const text = interaction.options.getString("text", true).trim();
      if (text.length === 0) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Missing Text", "Enter what to remind you about."),
          ),
        );
        return;
      }

      let durationMs: number;
      try {
        durationMs = parseDuration(durationInput);
      } catch (error) {
        const message =
          error instanceof DurationParseError
            ? error.message
            : "That duration is not valid.";
        await interaction.reply(
          ephemeralCard(makeErrorCard("Invalid Duration", message)),
        );
        return;
      }

      const repeatInput = interaction.options.getString("repeat")?.trim();
      const recurringCron =
        repeatInput && repeatInput.length > 0 ? repeatInput : null;
      if (recurringCron) {
        if (!config.allowRecurring) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Recurring Disabled",
                "Recurring reminders are disabled on this server.",
              ),
            ),
          );
          return;
        }
        if (!isValidCron(recurringCron)) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Invalid Cron",
                "Use a five-field UTC cron expression such as `0 9 * * 1-5`.",
              ),
            ),
          );
          return;
        }
      }

      const selectedId =
        interaction.options.getChannel("channel")?.id ?? interaction.channelId;
      const channel = interaction.guild?.channels.cache.get(selectedId) ?? null;
      if (!channel || !(await validateChannel(interaction, channel))) return;

      const activeCount = await countActiveReminders(services, guildId, userId);
      if (!canCreateReminder(activeCount, config.maxPerUser)) {
        await interaction.reply(
          ephemeralCard(
            makeWarningCard(
              "Reminder Limit Reached",
              `You already have ${activeCount} active reminders. The limit is ${config.maxPerUser}; cancel or snooze one first.`,
            ),
          ),
        );
        return;
      }

      const now = new Date();
      const reminder = await createReminder(services, {
        guildId,
        userId,
        channelId: channel.id,
        message: truncateReminderMessage(text),
        remindAt: new Date(now.getTime() + durationMs),
        recurringCron,
      });

      await interaction.reply(
        ephemeralCard(reminderCreatedCard(reminder, reminder.remindAt)),
      );
      return;
    }

    if (sub === "list") {
      const reminders = await listActiveReminders(services, guildId, userId);
      await interaction.reply(ephemeralCard(reminderListCard(reminders)));
      return;
    }

    if (sub === "cancel") {
      const id = interaction.options.getString("id", true);
      const resolved = await resolveUserReminder(services, guildId, userId, id);
      if (resolved.kind === "ambiguous") {
        await interaction.reply(
          ephemeralCard(
            makeWarningCard(
              "Ambiguous Reminder",
              "That ID matches more than one reminder. Use a longer ID.",
            ),
          ),
        );
        return;
      }
      if (resolved.kind === "missing") {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Reminder Not Found",
              "No active reminder with that ID belongs to you.",
            ),
          ),
        );
        return;
      }
      const cancelled = await cancelUserReminder(services, resolved.reminder);
      if (!cancelled) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Already Finished",
              "That reminder was delivered or cancelled already.",
            ),
          ),
        );
        return;
      }
      await interaction.reply(
        ephemeralCard(reminderCancelledCard(resolved.reminder)),
      );
      return;
    }

    if (sub === "clear") {
      const confirmed = interaction.options.getBoolean("confirm", true);
      if (!confirmed) {
        await interaction.reply(
          ephemeralCard(
            makeWarningCard(
              "Clear Cancelled",
              "Run the command again with `confirm: true` to cancel all reminders.",
            ),
          ),
        );
        return;
      }
      const count = await clearUserReminders(services, guildId, userId);
      await interaction.reply(ephemeralCard(reminderClearedCard(count)));
      return;
    }

    const id = interaction.options.getString("id", true);
    const durationInput = interaction.options.getString("duration", true);
    let durationMs: number;
    try {
      durationMs = parseDuration(durationInput);
    } catch (error) {
      const message =
        error instanceof DurationParseError
          ? error.message
          : "That duration is not valid.";
      await interaction.reply(
        ephemeralCard(makeErrorCard("Invalid Duration", message)),
      );
      return;
    }

    const resolved = await resolveUserReminder(services, guildId, userId, id);
    if (resolved.kind === "ambiguous") {
      await interaction.reply(
        ephemeralCard(
          makeWarningCard(
            "Ambiguous Reminder",
            "That ID matches more than one reminder. Use a longer ID.",
          ),
        ),
      );
      return;
    }
    if (resolved.kind === "missing") {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Reminder Not Found",
            "No active reminder with that ID belongs to you.",
          ),
        ),
      );
      return;
    }

    const nextAt = new Date(Date.now() + durationMs);
    const snoozed = await snoozeUserReminder(
      services,
      resolved.reminder,
      nextAt,
    );
    if (!snoozed) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Already Finished",
            "That reminder was delivered or cancelled already.",
          ),
        ),
      );
      return;
    }
    await interaction.reply(
      ephemeralCard(reminderSnoozedCard(resolved.reminder, nextAt)),
    );
  },
};

const deliveryTask: TaskDefinition = {
  name: "deliver-due",
  cron: "*/1 * * * *",
  async handler(services) {
    const result = await deliverDueReminders(services);
    if (result.processed > 0) {
      services.observability?.logger?.info?.("reminders delivered", result);
    }
  },
};

const cleanupTask: TaskDefinition = {
  name: "retention-cleanup",
  cron: "*/60 * * * *",
  async handler(services) {
    await cleanupDeliveredReminders(services);
  },
};

const remindersModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Reminders",
  emoji: "⏰",
  description: "Create, list, snooze, and cancel personal reminders",
  version: "2.0.0",
  config: ReminderConfigSchema,
  commands: [remindCommand],
  listeners: [],
  tasks: [deliveryTask, cleanupTask],
  async onLoad() {
    console.log("[reminders] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[reminders] Module unloaded");
  },
});

export default remindersModule;
