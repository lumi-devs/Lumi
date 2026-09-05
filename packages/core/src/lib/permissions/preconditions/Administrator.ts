import type { ChatInputCommandInteraction, Message } from "discord.js";
import { PermitPrecondition } from "#lib/permissions/PermitPrecondition.js";
import { memberRoleIds } from "./RequirePermit.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    Administrator: never;
  }
}

const DeniedMessage = "You need at least **Administrator** level to use this.";

export class AdministratorPrecondition extends PermitPrecondition {
  public override messageRun(message: Message) {
    if (!message.guild) return this.outsideGuild();
    return this.checkPermit(
      message.guild.id,
      message.author.id,
      memberRoleIds(message.member),
      message.channelId,
      "admin.*",
      message.guild.ownerId,
      DeniedMessage,
    );
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return this.outsideGuild();
    return this.checkPermit(
      interaction.guild.id,
      interaction.user.id,
      memberRoleIds(interaction.member),
      interaction.channelId,
      "admin.*",
      interaction.guild.ownerId,
      DeniedMessage,
    );
  }
}
