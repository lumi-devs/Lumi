import { container } from "@sapphire/framework";
import { UserError } from "@sapphire/framework";
import type {
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { memberRoleIds } from "#lib/permissions/preconditions/RequirePermit.js";

export async function requireManagePermit(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    throw new UserError({
      identifier: "PermissionDenied",
      message: "This can only be used in a server.",
    });
  }
  const hasPermit = await container.permitResolver.hasPermit({
    guildId: guild.id,
    userId: interaction.user.id,
    roleIds: memberRoleIds(interaction.member),
    channelId: interaction.channelId ?? undefined,
    permitNode: "reactionroles.manage",
    guildOwnerId: guild.ownerId,
  });
  if (!hasPermit) {
    throw new UserError({
      identifier: "PermissionDenied",
      message: "You lack the required permit (`reactionroles.manage`) to use this.",
    });
  }
}
