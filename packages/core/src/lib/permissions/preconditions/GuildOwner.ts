import { Precondition } from "@sapphire/framework";
import type { ChatInputCommandInteraction, Message } from "discord.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    GuildOwner: never;
  }
}

export class GuildOwnerPrecondition extends Precondition {
  public override messageRun(message: Message) {
    if (!message.guild) return this.ok();
    return this.#check(message.author.id, message.guild.ownerId);
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return this.ok();
    return this.#check(interaction.user.id, interaction.guild.ownerId);
  }

  async #check(userId: string, guildOwnerId: string) {
    return PermitResolver.isGuildOwner(guildOwnerId, userId)
      ? this.ok()
      : this.error({
          identifier: "PermissionDenied",
          message: "You need at least **Server Owner** level to use this.",
          context: { i18nKey: LanguageKeys.Preconditions.GuildOwner },
        });
  }
}
