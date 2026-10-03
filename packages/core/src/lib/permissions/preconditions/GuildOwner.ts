import { Precondition } from "@sapphire/framework";
import type { ChatInputCommandInteraction, Message } from "discord.js";
import { authorize } from "#lib/permissions/authorize.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    GuildOwner: never;
  }
}

export class GuildOwnerPrecondition extends Precondition {
  public override messageRun(message: Message) {
    if (!message.guild) return this.#outsideGuild();
    return this.#check(message.author.id, message.guild.ownerId);
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return this.#outsideGuild();
    return this.#check(interaction.user.id, interaction.guild.ownerId);
  }

  #outsideGuild() {
    return this.error({
      identifier: "PermissionDenied",
      message: "This command can only be used in a server.",
    });
  }

  async #check(userId: string, guildOwnerId: string) {
    const allowed = await authorize({ userId, guildOwnerId }, { kind: "guildOwner" });
    return allowed
      ? this.ok()
      : this.error({
          identifier: "PermissionDenied",
          message: "You need at least **Server Owner** level to use this.",
          context: { i18nKey: "preconditions:guildOwner" },
        });
  }
}
