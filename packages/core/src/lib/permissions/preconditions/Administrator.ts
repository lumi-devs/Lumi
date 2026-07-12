import { Precondition } from "@sapphire/framework";
import type { ChatInputCommandInteraction, Message } from "discord.js";
import {
  PermissionLevel,
  resolvePermissionLevel,
} from "#lib/permissions/index.js";
import { LanguageKeys } from "#lib/i18n/keys.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    Administrator: never;
  }
}

export class AdministratorPrecondition extends Precondition {
  public override messageRun(message: Message) {
    return this.#check(message);
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    return this.#check(interaction);
  }

  async #check(ctx: ChatInputCommandInteraction | Message) {
    const actual = await resolvePermissionLevel(ctx);
    return actual >= PermissionLevel.ADMIN
      ? this.ok()
      : this.error({
          identifier: "PermissionDenied",
          message: `You need at least **Administrator** level to use this.`,
          context: { i18nKey: LanguageKeys.Preconditions.Administrator },
        });
  }
}
