import { Precondition } from "@sapphire/framework";
import type { ChatInputCommandInteraction, Message } from "discord.js";
import { PermissionLevel, resolvePermissionLevel } from "#lib/permissions.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    Moderator: never;
  }
}

export class ModeratorPrecondition extends Precondition {
  public override messageRun(message: Message) {
    return this.#check(message);
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    return this.#check(interaction);
  }

  async #check(ctx: ChatInputCommandInteraction | Message) {
    const actual = await resolvePermissionLevel(ctx);
    return actual >= PermissionLevel.MOD
      ? this.ok()
      : this.error({
          identifier: "PermissionDenied",
          message: `You need at least **Moderator** level to use this.`,
          context: { i18nKey: "preconditions:moderator" },
        });
  }
}
