import { Precondition } from "@sapphire/framework";
import type { ChatInputCommandInteraction, Message } from "discord.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    BotOwner: never;
  }
}

export class BotOwnerPrecondition extends Precondition {
  public override messageRun(message: Message) {
    return this.#check(message.author.id);
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    return this.#check(interaction.user.id);
  }

  async #check(userId: string) {
    return PermitResolver.isBotOwner(userId)
      ? this.ok()
      : this.error({
          identifier: "PermissionDenied",
          message: "You need at least **Bot Owner** level to use this.",
          context: { i18nKey: LanguageKeys.Preconditions.BotOwner },
        });
  }
}
