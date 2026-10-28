import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type GuildMember,
  type APIInteractionGuildMember,
} from "discord.js";
import {
  defineModule,
  type CommandDefinition,
  type ModuleDefinition,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { z } from "zod";
import { canChangeNickname } from "./hierarchy.js";

const NickConfigSchema = z.object({
  allowSelfNick: z.boolean().default(false),
  maxLength: z.number().int().min(1).max(32).default(32),
}, {});

const getNickConfig = async (services: any, guildId: string) =>
  NickConfigSchema.parse((await services.config.get(guildId, "nick")) ?? {});

type AnyGuildMember = GuildMember | APIInteractionGuildMember | null | undefined;

function roleIdsOf(member: AnyGuildMember): string[] {
  if (!member) return [];
  const roles = (member as { roles?: unknown }).roles;
  if (Array.isArray(roles)) return roles as string[];
  const cache = (roles as { cache?: Map<string, unknown> } | undefined)?.cache;
  return cache ? Array.from(cache.keys()) : [];
}

function topRolePosition(guild: any, member: AnyGuildMember): number {
  return roleIdsOf(member).reduce((top, roleId) => {
    const position = guild.roles?.cache?.get(roleId)?.position ?? 0;
    return Math.max(top, position);
  }, 0);
}

async function hasNickPermit(
  interaction: any,
  services: any,
): Promise<boolean> {
  try {
    const result = await services.permits.explainPermit(
      {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        roleIds: roleIdsOf(interaction.member),
        channelId: interaction.channelId,
        guildOwnerId: interaction.guild?.ownerId,
        permitNode: "mod.nick",
      },
      services.client,
    );
    return result.allowed === true;
  } catch {
    return false;
  }
}

const nickDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("nick")
    .setDescription("Change your nickname or a lower-ranked member's nickname")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member to rename (defaults to you)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("nickname")
        .setDescription("New nickname (leave empty to reset)")
        .setRequired(false)
        .setMaxLength(32),
    ),
  requiredPermit: "mod.nick",
  async execute(interaction, services) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Nicknames can only be changed in a server."),
        ),
      );
      return;
    }

    if (!(await hasNickPermit(interaction, services))) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permit",
            "You need the `mod.nick` permit to change nicknames.",
          ),
        ),
      );
      return;
    }

    const config = await getNickConfig(services, guild.id);
    const requestedUser = interaction.options.getUser("user");
    const isSelf = !requestedUser || requestedUser.id === interaction.user.id;
    const trimmed = interaction.options.getString("nickname");
    const nickname = trimmed === null ? null : trimmed.trim();

    if (nickname !== null && nickname.length > config.maxLength) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Nickname Too Long",
            `Nicknames can be at most ${config.maxLength} characters.`,
          ),
        ),
      );
      return;
    }

    if (isSelf) {
      if (!config.allowSelfNick) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Self Changes Disabled",
              "Changing your own nickname is disabled on this server.",
            ),
          ),
        );
        return;
      }

      const self = await guild.members
        .fetch(interaction.user.id)
        .catch(() => null);
      if (!self) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Not Found", "Could not load your member record."),
          ),
        );
        return;
      }

      try {
        await self.setNickname(
          nickname && nickname.length > 0 ? nickname : null,
          "Self nickname change",
        );
      } catch {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Cannot Change",
              "Discord did not allow that nickname change.",
            ),
          ),
        );
        return;
      }

      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Nickname Changed", [
            `**Nickname**\n${nickname ? `\`${nickname}\`` : "*Reset*"}`,
          ]),
        ),
      );
      return;
    }

    const target = await guild.members
      .fetch(requestedUser.id)
      .catch(() => null);
    if (!target) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Not Found", "That user is not in this server."),
        ),
      );
      return;
    }

    if (target.id === guild.members.me?.id) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Cannot Change", "I cannot change my own nickname."),
        ),
      );
      return;
    }

    const decision = canChangeNickname({
      actorTopRolePosition: topRolePosition(guild, interaction.member as AnyGuildMember),
      targetTopRolePosition: topRolePosition(guild, target),
      actorIsGuildOwner: interaction.user.id === guild.ownerId,
      targetIsGuildOwner: target.id === guild.ownerId,
    });

    if (!decision.allowed) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Cannot Change", decision.reason)),
      );
      return;
    }

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permission",
            "I need the **Manage Nicknames** permission.",
          ),
        ),
      );
      return;
    }

    if (!target.manageable) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Cannot Change",
            "That member's highest role is above mine.",
          ),
        ),
      );
      return;
    }

    try {
      await target.setNickname(
        nickname && nickname.length > 0 ? nickname : null,
        `Changed by ${interaction.user.tag}`,
      );
    } catch {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Cannot Change",
            "Discord did not allow that nickname change.",
          ),
        ),
      );
      return;
    }

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Nickname Changed", [
          `**Member**\n<@${target.id}> (\`${target.id}\`)`,
          `**Nickname**\n${nickname ? `\`${nickname}\`` : "*Reset*"}`,
        ]),
      ),
    );
  },
};

const nickModule: ModuleDefinition = defineModule({
  name: "utility-nick",
  displayName: "Nicknames",
  emoji: "📛",
  description: "Nickname changes with hierarchy checks and optional self-service",
  version: "2.0.0",
  config: NickConfigSchema,
  configFields: [
    {
      key: "allowSelfNick",
      label: "Allow Self Changes",
      type: "boolean",
      description: "Let members with the mod.nick permit change their own nickname",
    },
    {
      key: "maxLength",
      label: "Max Nickname Length",
      type: "number",
      description: "Maximum nickname length",
    },
  ],
  commands: [nickDef],
  listeners: [],
  tasks: [],
  async onLoad(_services) {
    console.log("[nick] Module loaded");
    return [];
  },
  async onUnload(_services) {
    console.log("[nick] Module unloaded");
  },
});

export default nickModule;
