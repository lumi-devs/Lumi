import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  User,
  GuildTextBasedChannel,
  ButtonInteraction,
  Client,
} from "discord.js";
import {
  defineModule,
  type CommandDefinition,
  type ListenerDefinition,
  type ModuleDefinition,
} from "@lumi/module-kit";
import {
  createPaginationRow,
  ephemeralCard,
  formatPageFooter,
  makeCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "@lumi/ui";
import { z } from "zod";

function isTextGuildChannel(channel: any): channel is GuildTextBasedChannel & { permissionOverwrites: any } {
  return channel?.isTextBased?.() && "permissionOverwrites" in channel && !channel.isThread?.();
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getTargets(interaction: ChatInputCommandInteraction): Promise<User[]> {
  const single = interaction.options.getUser("user");
  const extra = interaction.options.getString("users");
  const ids = new Set(extra ? extra.split(/\s+/).filter(s => /^\d{17,19}$/.test(s)) : []);
  if (single) ids.add(single.id);

  const targets: User[] = [];
  for (const id of ids) {
    try {
      const user = await interaction.client.users.fetch(id);
      targets.push(user);
    } catch {}
  }
  return targets;
}

function getReason(interaction: ChatInputCommandInteraction): string {
  return interaction.options.getString("reason") ?? "No reason provided";
}

function getDeleteDays(interaction: ChatInputCommandInteraction): number {
  return interaction.options.getInteger("delete_days") ?? 0;
}

function actionCard(title: string, lines: string[], failures: number, total: number): CardReply {
  if (failures === 0) return makeSuccessCard(title, lines);
  if (failures >= total) return makeErrorCard(title, lines);
  return makeWarningCard(title, lines);
}

async function replyError(interaction: ChatInputCommandInteraction, title: string, body: string): Promise<void> {
  await interaction.reply(ephemeralCard(makeErrorCard(title, body)));
}

const banAdd: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("user").setDescription("User to ban").setRequired(false))
    .addStringOption(o => o.setName("users").setDescription("Additional user IDs").setRequired(false))
    .addStringOption(o => o.setName("reason").setDescription("Reason for ban").setRequired(false).setAutocomplete(true))
    .addIntegerOption(o => o.setName("delete_days").setDescription("Days of messages to delete (0-7)").setMinValue(0).setMaxValue(7).setRequired(false)),
  requiredPermit: "mod.ban",
  async execute(interaction, services) {
    const targets = await getTargets(interaction);
    if (targets.length === 0) {
      await replyError(interaction, "No targets", "Specify at least one user to ban");
      return;
    }

    const reason = getReason(interaction);
    const deleteDays = getDeleteDays(interaction);
    const guild = interaction.guild!;
    const moderator = interaction.user;

    const lines: string[] = [];
    let failures = 0;

    for (const target of targets) {
      try {
        await guild.members.ban(target, { deleteMessageSeconds: deleteDays * 86400, reason });

        await services.db.prisma.moderationCase.create({
          data: {
            guildId: guild.id,
            type: "BAN",
            targetId: target.id,
            moderatorId: moderator.id,
            reason,
            metadata: { deleteDays },
          },
        });

        lines.push(`✅ ${target.tag} (\`${target.id}\`)`);
      } catch (e) {
        failures++;
        lines.push(`❌ ${target.tag} (\`${target.id}\`) — ${describeError(e)}`);
      }
    }

    await interaction.reply(ephemeralCard(actionCard("Banned", lines, failures, targets.length)));
  },
};

const banRemove: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName("user_id").setDescription("User ID to unban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for unban").setRequired(false).setAutocomplete(true)),
  requiredPermit: "mod.unban",
  async execute(interaction, services) {
    const userId = interaction.options.getString("user_id", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    if (!/^\d{17,19}$/.test(userId)) {
      await replyError(interaction, "Invalid ID", "User ID must be a valid snowflake");
      return;
    }

    try {
      await guild.bans.remove(userId, reason);

      await services.db.prisma.moderationCase.create({
        data: {
          guildId: guild.id,
          type: "UNBAN",
          targetId: userId,
          moderatorId: interaction.user.id,
          reason,
        },
      });

      await interaction.reply(ephemeralCard(makeSuccessCard("Unbanned", [
        `**User**\n\`${userId}\``,
        `**Reason**\n${reason}`,
      ])));
    } catch (e) {
      await replyError(interaction, "Unban failed", describeError(e));
    }
  },
};

const kickDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName("user").setDescription("User to kick").setRequired(false))
    .addStringOption(o => o.setName("users").setDescription("Additional user IDs").setRequired(false))
    .addStringOption(o => o.setName("reason").setDescription("Reason for kick").setRequired(false).setAutocomplete(true)),
  requiredPermit: "mod.kick",
  async execute(interaction, services) {
    const targets = await getTargets(interaction);
    if (targets.length === 0) {
      await replyError(interaction, "No targets", "Specify at least one user to kick");
      return;
    }

    const reason = getReason(interaction);
    const guild = interaction.guild!;

    const lines: string[] = [];
    let failures = 0;

    for (const target of targets) {
      try {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) {
          failures++;
          lines.push(`❌ ${target.tag} — not in this server`);
          continue;
        }
        if (!member.kickable) {
          failures++;
          lines.push(`❌ ${target.tag} — higher role or bot`);
          continue;
        }
        await member.kick(reason);

        await services.db.prisma.moderationCase.create({
          data: { guildId: guild.id, type: "KICK", targetId: target.id, moderatorId: interaction.user.id, reason },
        });

        lines.push(`✅ ${target.tag} (\`${target.id}\`)`);
      } catch (e) {
        failures++;
        lines.push(`❌ ${target.tag} (\`${target.id}\`) — ${describeError(e)}`);
      }
    }

    await interaction.reply(ephemeralCard(actionCard("Kicked", lines, failures, targets.length)));
  },
};

const timeoutDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("User to timeout").setRequired(true))
    .addIntegerOption(o => o.setName("duration").setDescription("Duration in minutes").setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for timeout").setRequired(false).setAutocomplete(true)),
  requiredPermit: "mod.timeout",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const duration = interaction.options.getInteger("duration", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    try {
      const member = await guild.members.fetch(target.id).catch(() => null);
      if (!member) {
        await replyError(interaction, "Not in guild", "User is not in this server");
        return;
      }
      if (!member.moderatable) {
        await replyError(interaction, "Cannot timeout", "Cannot timeout this user (higher role or bot)");
        return;
      }
      await member.timeout(duration * 60 * 1000, reason);

      await services.db.prisma.moderationCase.create({
        data: { guildId: guild.id, type: "TIMEOUT", targetId: target.id, moderatorId: interaction.user.id, reason, metadata: { duration } },
      });

      await interaction.reply(ephemeralCard(makeSuccessCard("Timed out", [
        `**User**\n${target.tag} (\`${target.id}\`)`,
        `**Duration**\n${duration} minute${duration === 1 ? "" : "s"}`,
        `**Reason**\n${reason}`,
      ])));
    } catch (e) {
      await replyError(interaction, "Timeout failed", describeError(e));
    }
  },
};

const warnDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("User to warn").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for warning").setRequired(false).setAutocomplete(true)),
  requiredPermit: "mod.warn",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    await services.db.prisma.moderationCase.create({
      data: { guildId: guild.id, type: "WARN", targetId: target.id, moderatorId: interaction.user.id, reason },
    });

    const config = await services.config.get(guild.id, "warnThresholds");
    if (config) {
      const thresholds = config as Record<string, { action: string; duration?: number }>;
      const warnCount = await services.db.prisma.moderationCase.count({
        where: { guildId: guild.id, type: "WARN", targetId: target.id },
      });

      for (const [threshold, action] of Object.entries(thresholds)) {
        if (warnCount >= parseInt(threshold)) {
          break;
        }
      }
    }

    await interaction.reply(ephemeralCard(makeSuccessCard("Warned", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Reason**\n${reason}`,
    ])));
  },
};

const purgeDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("amount").setDescription("Number of messages (1-100)").setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption(o => o.setName("user").setDescription("Only delete from this user").setRequired(false))
    .addStringOption(o => o.setName("contains").setDescription("Only delete messages containing this text").setRequired(false))
    .addBooleanOption(o => o.setName("links").setDescription("Only delete messages with links").setRequired(false))
    .addBooleanOption(o => o.setName("bots").setDescription("Only delete bot messages").setRequired(false)),
  requiredPermit: "utility.purge",
  async execute(interaction) {
    const amount = interaction.options.getInteger("amount", true);
    const channel = interaction.channel!;

    if (!channel.isTextBased() || channel.isDMBased()) {
      await replyError(interaction, "Invalid channel", "Can only purge in text channels");
      return;
    }

    const user = interaction.options.getUser("user");
    const contains = interaction.options.getString("contains");
    const links = interaction.options.getBoolean("links");
    const bots = interaction.options.getBoolean("bots");

    const messages = await channel.messages.fetch({ limit: amount });
    let toDelete = messages.filter(m => !m.pinned);

    if (user) toDelete = toDelete.filter(m => m.author.id === user.id);
    if (contains) toDelete = toDelete.filter(m => m.content.includes(contains));
    if (links) toDelete = toDelete.filter(m => m.content.match(/https?:\/\//));
    if (bots) toDelete = toDelete.filter(m => m.author.bot);

    const deleted = await channel.bulkDelete(toDelete, true);

    await interaction.reply(ephemeralCard(makeSuccessCard("Purged", [
      `**Deleted**\n${deleted.size} message${deleted.size === 1 ? "" : "s"}`,
      `**Channel**\n${channel}`,
    ])));
  },
};

const noteDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Add a note to a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("User to note").setRequired(true))
    .addStringOption(o => o.setName("note").setDescription("Note content").setRequired(true).setMaxLength(1000)),
  requiredPermit: "mod.note",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const note = interaction.options.getString("note", true);
    const guild = interaction.guild!;

    await services.db.prisma.moderationCase.create({
      data: {
        guildId: guild.id,
        type: "NOTE",
        targetId: target.id,
        moderatorId: interaction.user.id,
        reason: note,
        metadata: { type: "note" }
      },
    });

    await interaction.reply(ephemeralCard(makeSuccessCard("Note Added", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Note**\n${note}`,
    ])));
  },
};

const lockDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o => o.setName("channel").setDescription("Channel to lock").setRequired(false))
    .addStringOption(o => o.setName("reason").setDescription("Reason for lock").setRequired(false)),
  requiredPermit: "mod.lock",
  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") ?? interaction.channel!;
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    if (!isTextGuildChannel(channel)) {
      await replyError(interaction, "Invalid", "Can only lock text channels");
      return;
    }

    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason });

    await interaction.reply(ephemeralCard(makeSuccessCard("Locked", [
      `**Channel**\n${channel}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

const unlockDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o => o.setName("channel").setDescription("Channel to unlock").setRequired(false))
    .addStringOption(o => o.setName("reason").setDescription("Reason for unlock").setRequired(false)),
  requiredPermit: "mod.lock",
  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") ?? interaction.channel!;
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    if (!isTextGuildChannel(channel)) {
      await replyError(interaction, "Invalid", "Can only unlock text channels");
      return;
    }

    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason });

    await interaction.reply(ephemeralCard(makeSuccessCard("Unlocked", [
      `**Channel**\n${channel}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

const lockdownDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock all channels in the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("reason").setDescription("Reason for lockdown").setRequired(false)),
  requiredPermit: "mod.lockdown",
  async execute(interaction) {
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    const channels = guild.channels.cache.filter(c => isTextGuildChannel(c));

    for (const channel of channels.values()) {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason }).catch(() => {});
    }

    await interaction.reply(ephemeralCard(makeWarningCard("Lockdown", [
      `**Channels locked**\n${channels.size}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

const softbanDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("softban")
    .setDescription("Softban a user (ban + immediate unban)")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("user").setDescription("User to softban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false).setAutocomplete(true)),
  requiredPermit: "mod.ban",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    try {
      await guild.members.ban(target, { reason, deleteMessageSeconds: 86400 });
      await guild.bans.remove(target.id, "Softban: " + reason);

      await services.db.prisma.moderationCase.create({
        data: { guildId: guild.id, type: "SOFTBAN", targetId: target.id, moderatorId: interaction.user.id, reason },
      });

      await interaction.reply(ephemeralCard(makeSuccessCard("Softbanned", [
        `**User**\n${target.tag} (\`${target.id}\`)`,
        `**Reason**\n${reason}`,
      ])));
    } catch (e) {
      await replyError(interaction, "Softban failed", describeError(e));
    }
  },
};

const quarantineDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("quarantine")
    .setDescription("Quarantine a user (assign quarantine role, remove other roles)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("User to quarantine").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false).setAutocomplete(true)),
  requiredPermit: "mod.quarantine",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;
    const config = await services.config.get(guild.id, "mod") as any ?? {};

    if (!config.quarantineRoleId) {
      await replyError(interaction, "Not configured", "Quarantine role not set");
      return;
    }

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await replyError(interaction, "Not found", "User not in server");
      return;
    }

    const oldRoles = member.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
    const quarantineRole = guild.roles.cache.get(config.quarantineRoleId);

    if (!quarantineRole) {
      await replyError(interaction, "Failed", "Quarantine role not found");
      return;
    }

    await member.roles.set([quarantineRole], reason);

    await services.db.prisma.moderationCase.create({
      data: {
        guildId: guild.id,
        type: "QUARANTINE",
        targetId: target.id,
        moderatorId: interaction.user.id,
        reason,
        metadata: { oldRoles }
      },
    });

    await interaction.reply(ephemeralCard(makeWarningCard("Quarantined", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Role**\n${quarantineRole}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

const unquarantineDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unquarantine")
    .setDescription("Remove quarantine from a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("User to unquarantine").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),
  requiredPermit: "mod.quarantine",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await replyError(interaction, "Not found", "User not in server");
      return;
    }

    const quarantineCase = await services.db.prisma.moderationCase.findFirst({
      where: { guildId: guild.id, type: "QUARANTINE", targetId: target.id, active: true },
      orderBy: { createdAt: "desc" }
    });

    const oldRoles = quarantineCase?.metadata?.oldRoles as string[] ?? [];
    const validRoles = oldRoles.filter(id => guild.roles.cache.has(id));

    await member.roles.set(validRoles, reason);

    if (quarantineCase) {
      await services.db.prisma.moderationCase.update({
        where: { id: quarantineCase.id },
        data: { active: false }
      });
    }

    await services.db.prisma.moderationCase.create({
      data: { guildId: guild.id, type: "UNQUARANTINE", targetId: target.id, moderatorId: interaction.user.id, reason },
    });

    await interaction.reply(ephemeralCard(makeSuccessCard("Unquarantined", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Roles restored**\n${validRoles.length}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

const vcmuteDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("vcmute")
    .setDescription("Mute a user in voice channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption(o => o.setName("user").setDescription("User to mute").setRequired(true))
    .addIntegerOption(o => o.setName("duration").setDescription("Duration in minutes (0 = permanent)").setMinValue(0).setMaxValue(40320).setRequired(false))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false).setAutocomplete(true)),
  requiredPermit: "mod.vcmute",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const duration = interaction.options.getInteger("duration") ?? 0;
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await replyError(interaction, "Not found", "User not in server");
      return;
    }

    if (!member.voice.channel) {
      await replyError(interaction, "Not in VC", "User is not in a voice channel");
      return;
    }

    await member.voice.setMute(true, reason);

    if (duration > 0) {
      setTimeout(() => {
        member.voice.setMute(false, "VC mute expired").catch(() => {});
      }, duration * 60 * 1000);
    }

    await services.db.prisma.moderationCase.create({
      data: {
        guildId: guild.id,
        type: "VOICE_MUTE",
        targetId: target.id,
        moderatorId: interaction.user.id,
        reason,
        metadata: { duration }
      },
    });

    await interaction.reply(ephemeralCard(makeWarningCard("VC Muted", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Duration**\n${duration > 0 ? `${duration} minute${duration === 1 ? "" : "s"}` : "Permanent"}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

const vcmuteRemoveDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unvcmute")
    .setDescription("Remove voice mute from a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption(o => o.setName("user").setDescription("User to unmute").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),
  requiredPermit: "mod.vcmute",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await replyError(interaction, "Not found", "User not in server");
      return;
    }

    await member.voice.setMute(false, reason);

    await services.db.prisma.moderationCase.create({
      data: { guildId: guild.id, type: "UNVOICE_MUTE", targetId: target.id, moderatorId: interaction.user.id, reason },
    });

    await interaction.reply(ephemeralCard(makeSuccessCard("VC Unmuted", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Reason**\n${reason}`,
    ])));
  },
};

const caseDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("View a moderation case")
    .addIntegerOption(o => o.setName("id").setDescription("Case ID").setRequired(true)),
  requiredPermit: "mod.case",
  async execute(interaction, services) {
    const caseId = interaction.options.getInteger("id", true);
    const guildId = interaction.guildId!;

    const modCase = await services.db.prisma.moderationCase.findFirst({
      where: { guildId, caseNumber: caseId }
    });

    if (!modCase) {
      await replyError(interaction, "Not found", `Case #${caseId} does not exist`);
      return;
    }

    const moderator = await interaction.client.users.fetch(modCase.moderatorId).catch(() => null);
    const target = await interaction.client.users.fetch(modCase.targetId).catch(() => null);
    const createdAt = Math.floor(new Date(modCase.createdAt).getTime() / 1000);
    const caseType = modCase.type ?? modCase.action ?? "CASE";

    await interaction.reply(ephemeralCard(makeInfoCard(
      `Case #${modCase.caseNumber} — ${caseType}`,
      [
        `**Target**\n${target?.tag ?? "Unknown"} (\`${modCase.targetId}\`)`,
        `**Moderator**\n${moderator?.tag ?? "Unknown"} (\`${modCase.moderatorId}\`)`,
        `**Reason**\n${modCase.reason ?? "No reason provided"}`,
      ],
      {
        statusBadge: { status: modCase.active === false ? "inactive" : "active", label: modCase.active === false ? "CLOSED" : "ACTIVE" },
        footer: `Created <t:${createdAt}:F>`,
      },
    )));
  },
};

const CasesPerPage = 10;

async function buildCasesCard(
  client: Client,
  services: any,
  guildId: string,
  targetId: string,
  targetTag: string,
  pageIndex: number,
): Promise<CardReply> {
  const total = await services.db.prisma.moderationCase.count({ where: { guildId, targetId } });
  const totalPages = Math.max(1, Math.ceil(total / CasesPerPage));
  const page = Math.min(Math.max(1, pageIndex + 1), totalPages);

  const cases = await services.db.prisma.moderationCase.findMany({
    where: { guildId, targetId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * CasesPerPage,
    take: CasesPerPage,
  });

  if (cases.length === 0) {
    return makeInfoCard(`📋 Cases for ${targetTag}`, "No moderation cases found.", {
      footer: formatPageFooter(0, 1, total),
    });
  }

  const offset = (page - 1) * CasesPerPage;
  const lines = cases.map((c: any, i: number) => {
    const moderator = client.users.cache.get(c.moderatorId);
    const reason = (c.reason ?? "No reason provided").slice(0, 80);
    const timestamp = Math.floor(new Date(c.createdAt).getTime() / 1000);
    const when = Number.isFinite(timestamp) ? `<t:${timestamp}:R>` : "unknown time";
    const caseType = c.type ?? c.action ?? "CASE";
    const caseNumber = c.caseNumber ?? offset + i + 1;
    return `\`#${caseNumber}\` **${caseType}** — ${reason} · ${moderator?.tag ?? c.moderatorId} · ${when}`;
  });

  return makeCard(undefined, `📋 Cases for ${targetTag}`, lines, {
    footer: formatPageFooter(page - 1, totalPages, total),
    actionRows: [
      createPaginationRow({
        customIdPrefix: `mod:cases:${targetId}`,
        currentPage: page - 1,
        totalPages,
      }),
    ],
    separatorAboveActionRows: true,
  });
}

const casesDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("cases")
    .setDescription("List moderation cases for a user")
    .addUserOption(o => o.setName("user").setDescription("User to view cases for").setRequired(true))
    .addIntegerOption(o => o.setName("page").setDescription("Page number").setMinValue(1).setRequired(false)),
  requiredPermit: "mod.case",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const page = interaction.options.getInteger("page") ?? 1;
    const card = await buildCasesCard(
      interaction.client,
      services,
      interaction.guildId!,
      target.id,
      target.tag,
      page - 1,
    );
    await interaction.reply(ephemeralCard(card));
  },
};

const casesPaginationListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: ButtonInteraction, services: any) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("mod:cases:")) return;

    const [prefix, scope, targetId, action, pageValue] = interaction.customId.split(":");
    if (prefix !== "mod" || scope !== "cases" || !targetId) return;
    if (action !== "prev" && action !== "next") return;

    const guildId = interaction.guildId;
    if (!guildId) return;
    if (!(services.modules?.isEnabled(guildId, "mod") ?? true)) {
      await interaction.reply(ephemeralCard(makeErrorCard("Module disabled", "The mod module is disabled on this server.")));
      return;
    }

    const pageIndex = Number.parseInt(pageValue ?? "0", 10);

    await interaction.deferUpdate().catch(() => {});

    try {
      const target = await interaction.client.users.fetch(targetId).catch(() => null);
      const card = await buildCasesCard(
        interaction.client,
        services,
        guildId,
        targetId,
        target?.tag ?? targetId,
        Number.isFinite(pageIndex) ? pageIndex : 0,
      );
      await interaction.editReply(card);
    } catch (e) {
      await interaction.editReply(makeErrorCard("Cases failed", describeError(e))).catch(() => {});
    }
  },
};

const modModule: ModuleDefinition = defineModule({
  name: "mod",
  displayName: "Moderation",
  emoji: "🛡️",
  description: "Case-backed moderation with bans, kicks, timeouts, warns, purge, notes, lockdown, softban, quarantine, voice mute",
  version: "2.0.0",
  config: z.object({
    quarantineRoleId: z.string().nullable().optional(),
    maxTargets: z.number().int().min(1).max(100).default(10),
    immuneRoleIds: z.array(z.string()).default([]),
    warnThresholds: z.record(z.object({
      action: z.enum(["timeout", "ban"]),
      duration: z.number().int().min(60).optional(),
    })).default({}),
  }),
  configFields: [
    { key: "quarantineRoleId", label: "Quarantine Role", type: "role", description: "Role assigned when quarantined" },
    { key: "maxTargets", label: "Max Targets", type: "number", description: "Max members per command" },
    { key: "immuneRoleIds", label: "Immune Roles", type: "multi-role", description: "Roles exempt from auto-actions" },
    { key: "warnThresholds", label: "Warn Thresholds", type: "json", description: "JSON object: warn count -> {action, duration}" },
  ],
  commands: [banAdd, banRemove, kickDef, timeoutDef, warnDef, purgeDef, noteDef, lockDef, unlockDef, lockdownDef, softbanDef, quarantineDef, unquarantineDef, vcmuteDef, vcmuteRemoveDef, caseDef, casesDef],
  listeners: [casesPaginationListener],
  tasks: [],
  async onLoad(services) {
    console.log("[mod] Module loaded");
    return [];
  },
  async onUnload(services) {
    console.log("[mod] Module unloaded");
  },
});

export default modModule;
