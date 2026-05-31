import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, type Args } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import {
  ApplicationIntegrationType,
  Colors,
  type ChatInputCommandInteraction,
  type Message,
  type GuildMember,
  MessageFlags,
} from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  makeSuccessCard,
  makeErrorCard,
  type CardReply,
} from "#utilities/cards.js";
import { formatAuditReason } from "#utilities/audit.js";
import { logToChannel } from "../lib/helpers.js";

// Redis key: lumi:mod:{guildId}:quarantine:{userId} → JSON array of role IDs
const quarantineKey = (guildId: string, userId: string) =>
  `lumi:mod:${guildId}:quarantine:${userId}`;

@ApplyOptions<BaseSubcommand.Options>({
  name: "quarantine",
  description: "Quarantine or release a member",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  subcommands: [
    {
      name: "add",
      chatInputRun: "chatInputRunAdd",
      messageRun: "messageRunAdd",
    },
    {
      name: "remove",
      chatInputRun: "chatInputRunRemove",
      messageRun: "messageRunRemove",
    },
  ],
})
export class QuarantineCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Put a member into quarantine")
            .addUserOption((o) =>
              o
                .setName("member")
                .setDescription("Member to quarantine")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o.setName("reason").setDescription("Reason").setRequired(false),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Release a member from quarantine")
            .addUserOption((o) =>
              o
                .setName("member")
                .setDescription("Member to release")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o.setName("reason").setDescription("Reason").setRequired(false),
            ),
        ),
    );
  }

  public async chatInputRunAdd(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = interaction.options.getMember(
      "member",
    ) as GuildMember | null;
    const reason =
      interaction.options.getString("reason") ?? "No reason provided.";
    if (!member)
      return interaction.editReply(
        makeErrorCard("Not Found", "Member not in this server."),
      );
    return this.#add(
      interaction.guildId!,
      member,
      interaction.user.id,
      reason,
      (c) => interaction.editReply(c),
    );
  }

  public async messageRunAdd(message: Message, args: Args) {
    const member = await args.pick("member").catch(() => null);
    const reason = await args.rest("string").catch(() => "No reason provided.");
    if (!member)
      return message.reply(
        makeErrorCard("Not Found", "Provide a valid member."),
      );
    return this.#add(message.guildId!, member, message.author.id, reason, (c) =>
      message.reply(c),
    );
  }

  public async chatInputRunRemove(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = interaction.options.getMember(
      "member",
    ) as GuildMember | null;
    const reason =
      interaction.options.getString("reason") ?? "No reason provided.";
    if (!member)
      return interaction.editReply(
        makeErrorCard("Not Found", "Member not in this server."),
      );
    return this.#remove(
      interaction.guildId!,
      member,
      interaction.user.id,
      reason,
      (c) => interaction.editReply(c),
    );
  }

  public async messageRunRemove(message: Message, args: Args) {
    const member = await args.pick("member").catch(() => null);
    const reason = await args.rest("string").catch(() => "No reason provided.");
    if (!member)
      return message.reply(
        makeErrorCard("Not Found", "Provide a valid member."),
      );
    return this.#remove(
      message.guildId!,
      member,
      message.author.id,
      reason,
      (c) => message.reply(c),
    );
  }

  async #add(
    guildId: string,
    member: GuildMember,
    actorId: string,
    reason: string,
    reply: (c: CardReply) => unknown,
  ) {
    const quarantineRoleId = await this.container.db.config.getModuleConfig(
      guildId,
      "mod",
      "quarantine_role_id",
    );
    if (!quarantineRoleId || typeof quarantineRoleId !== "string") {
      return reply(
        makeErrorCard(
          "Not Configured",
          "No quarantine role set. Use `/config set mod quarantine_role_id <role>`.",
        ),
      );
    }

    const key = quarantineKey(guildId, member.id);
    const alreadyQuarantined = await this.container.redis.exists(key);
    if (alreadyQuarantined)
      return reply(
        makeErrorCard(
          "Already Quarantined",
          `${member.user.username} is already in quarantine.`,
        ),
      );

    const savedRoles = member.roles.cache
      .filter((r) => r.id !== guildId && r.id !== quarantineRoleId)
      .map((r) => r.id);

    const actor = await this.container.client.users.fetch(actorId);
    try {
      await member.roles.set(
        [guildId, quarantineRoleId],
        formatAuditReason(actor, reason),
      );
    } catch {
      return reply(
        makeErrorCard(
          "Failed",
          "Could not apply quarantine. Check permissions and hierarchy.",
        ),
      );
    }

    // 30-day TTL prevents orphaned keys if the member leaves or is banned while quarantined
    await this.container.redis.set(
      key,
      JSON.stringify(savedRoles),
      "EX",
      30 * 24 * 60 * 60,
    );

    const c = await this.container.db.moderation.createModerationCase({
      guildId,
      userId: member.id,
      moderatorId: actorId,
      action: "mute",
      reason,
    });
    await logToChannel(
      this.container,
      guildId,
      "🔒 Quarantined",
      Colors.Orange,
      member.id,
      actor,
      reason,
      c.caseNumber,
    );
    return reply(
      makeSuccessCard(
        "🔒 Quarantined",
        `${member.user.username} has been quarantined.\n**Reason:** ${reason}\n**Case #${c.caseNumber}**`,
      ),
    );
  }

  async #remove(
    guildId: string,
    member: GuildMember,
    actorId: string,
    reason: string,
    reply: (c: CardReply) => unknown,
  ) {
    const key = quarantineKey(guildId, member.id);
    const saved = await this.container.redis.get(key);
    if (!saved)
      return reply(
        makeErrorCard(
          "Not Quarantined",
          `${member.user.username} is not in quarantine.`,
        ),
      );

    const parsedRoles = tryParseJSON(saved);
    const rolesToRestore = Array.isArray(parsedRoles)
      ? (parsedRoles as string[])
      : [];
    const actor = await this.container.client.users.fetch(actorId);

    const validRoles = rolesToRestore.filter((id) =>
      member.guild.roles.cache.has(id),
    );
    try {
      await member.roles.set(
        [guildId, ...validRoles],
        formatAuditReason(actor, reason),
      );
    } catch {
      return reply(
        makeErrorCard(
          "Failed",
          "Could not restore roles. Check permissions and hierarchy.",
        ),
      );
    }

    await this.container.redis.del(key);

    const c = await this.container.db.moderation.createModerationCase({
      guildId,
      userId: member.id,
      moderatorId: actorId,
      action: "unmute",
      reason,
    });
    await logToChannel(
      this.container,
      guildId,
      "🔓 Released",
      Colors.Green,
      member.id,
      actor,
      reason,
      c.caseNumber,
    );
    return reply(
      makeSuccessCard(
        "🔓 Released",
        `${member.user.username} has been released from quarantine.\n**Reason:** ${reason}\n**Case #${c.caseNumber}**`,
      ),
    );
  }
}
