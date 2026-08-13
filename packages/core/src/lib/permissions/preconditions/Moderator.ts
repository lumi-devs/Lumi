import { Precondition, container } from "@sapphire/framework";
import type { ChatInputCommandInteraction, Message } from "discord.js";
import { memberRoleIds } from "./RequirePermit.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    Moderator: never;
  }
}

export class ModeratorPrecondition extends Precondition {
  public override messageRun(message: Message) {
    if (!message.guild) return this.#outsideGuild();
    return this.#check(message.guild.id, message.author.id, memberRoleIds(message.member));
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return this.#outsideGuild();
    return this.#check(interaction.guild.id, interaction.user.id, memberRoleIds(interaction.member));
  }

  // A guild-scoped permit can never be satisfied outside a guild, so missing
  // guild context must deny rather than skip the check.
  #outsideGuild() {
    return this.error({
      identifier: "PermissionDenied",
      message: "This command can only be used in a server.",
    });
  }

  async #check(guildId: string, userId: string, roleIds: string[]) {
    const hasPermit = await container.permitResolver.hasPermit({
      guildId,
      userId,
      roleIds,
      permitNode: "mod.*",
      guildOwnerId: "",
    });
    return hasPermit
      ? this.ok()
      : this.error({
          identifier: "PermissionDenied",
          message: "You need at least **Moderator** level to use this.",
        });
  }
}
