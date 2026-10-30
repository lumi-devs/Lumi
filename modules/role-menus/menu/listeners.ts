import type { ModuleServices } from "@lumi/module-kit";
import { cardCreateOptions, ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  type ButtonInteraction,
  type Interaction,
  MessageFlags,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type StringSelectMenuInteraction,
  type User,
} from "discord.js";
import { RoleMenuIds } from "./ids.js";
import { reactionForOption } from "./posting.js";
import type { GroupRecord } from "./service.js";
import {
  applyForcedRoleRemoval,
  applyRoleSelection,
  fetchMember,
  findGroupById,
  findMenuMessage,
} from "./service.js";
import {
  selectionErrorCard,
  selectionSuccessCard,
  type MenuOption,
} from "./ui.js";

const ModuleName = "role-menus-menu";

async function replyError(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  title: string,
  message: string,
): Promise<void> {
  await interaction
    .reply(ephemeralCard(makeErrorCard(title, message)))
    .catch(() => undefined);
}

async function handleComponent(
  interaction: Interaction,
  services: ModuleServices,
): Promise<void> {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
  const parsed = RoleMenuIds.parse(interaction.customId);
  if (!parsed) return;
  if (!interaction.guildId || !interaction.guild) {
    await replyError(
      interaction,
      "Server Only",
      "Role menus only work inside a server.",
    );
    return;
  }
  if (!services.modules.isEnabled(interaction.guildId, ModuleName)) {
    await replyError(
      interaction,
      "Module Disabled",
      "The Role Menus module is disabled on this server.",
    );
    return;
  }

  const group = await findGroupById(
    services,
    interaction.guildId,
    parsed.groupId,
  );
  if (!group) {
    await replyError(
      interaction,
      "Menu Missing",
      "This role menu no longer exists.",
    );
    return;
  }

  const options = group.options;
  let requested: string[];
  if (parsed.kind === "button") {
    if (!interaction.isButton()) return;
    const option = options.find((item) => item.id === parsed.optionId);
    if (!option) {
      await replyError(
        interaction,
        "Option Missing",
        "That role option no longer exists. Ask staff to refresh the menu.",
      );
      return;
    }
    requested = [option.roleId];
  } else {
    if (!interaction.isStringSelectMenu()) return;
    const byId = new Map(options.map((option) => [option.id, option]));
    const selected = interaction.values
      .map((value) => byId.get(value))
      .filter((option): option is MenuOption => Boolean(option));
    if (selected.length !== interaction.values.length) {
      await replyError(
        interaction,
        "Option Missing",
        "One or more options no longer exist. Ask staff to refresh the menu.",
      );
      return;
    }
    requested = selected.map((option) => option.roleId);
  }

  const member = await fetchMember(interaction.guild, interaction.user.id);
  if (!member) {
    await replyError(
      interaction,
      "Member Missing",
      "I cannot find your member record in this server.",
    );
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await applyRoleSelection(
    services,
    interaction.guild,
    member,
    group,
    options,
    requested,
  );

  if (!result.ok) {
    await interaction.editReply(selectionErrorCard(group, result.message));
    return;
  }

  await interaction.editReply(
    selectionSuccessCard(
      group,
      result.addedRoleIds,
      result.removedRoleIds,
      result.temporary,
      result.refreshedRoleIds,
    ),
  );
}

async function loadReactionContext(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  services: ModuleServices,
): Promise<{
  group: GroupRecord;
  member: NonNullable<Awaited<ReturnType<typeof fetchMember>>>;
  roleId: string;
} | null> {
  if (user.bot) return null;
  const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
  const message = fullReaction.message.partial
    ? await fullReaction.message.fetch()
    : fullReaction.message;
  const guild = message.guild;
  if (!guild) return null;
  if (!services.modules.isEnabled(guild.id, ModuleName)) return null;

  const record = await findMenuMessage(services, message.id);
  if (!record) return null;
  if (record.style !== "reactions" || !record.groupId) return null;
  if (record.guildId !== guild.id) return null;

  const group = await findGroupById(services, guild.id, record.groupId);
  if (!group) return null;

  const option = reactionForOption(group.options, fullReaction.emoji);
  if (!option) return null;

  const member = await fetchMember(guild, user.id);
  if (!member) return null;

  return { group, member, roleId: option.roleId };
}

export const roleMenuInteractionListener = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    await handleComponent(interaction, services);
  },
};

export const roleMenuReactionAddListener = {
  event: "messageReactionAdd",
  async handler(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    services: ModuleServices,
  ) {
    const context = await loadReactionContext(reaction, user, services);
    if (!context) return;
    const result = await applyRoleSelection(
      services,
      context.member.guild,
      context.member,
      context.group,
      context.group.options,
      [context.roleId],
    );
    if (!result.ok && "send" in user) {
      await user
        .send(
          cardCreateOptions(selectionErrorCard(context.group, result.message)),
        )
        .catch(() => undefined);
    }
  },
};

export const roleMenuReactionRemoveListener = {
  event: "messageReactionRemove",
  async handler(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    services: ModuleServices,
  ) {
    const context = await loadReactionContext(reaction, user, services);
    if (!context) return;
    const result = await applyForcedRoleRemoval(
      services,
      context.member.guild,
      context.member,
      context.group,
      context.group.options,
      context.roleId,
    );
    if (!result.ok && "send" in user) {
      await user
        .send(
          cardCreateOptions(selectionErrorCard(context.group, result.message)),
        )
        .catch(() => undefined);
    }
  },
};
