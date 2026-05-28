import { AllFlowsPrecondition, container } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
} from "discord.js";

@ApplyOptions<AllFlowsPrecondition.Options>({ position: 20 })
export class NotBlockedPrecondition extends AllFlowsPrecondition {
  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    return this.#check(interaction.user.id, interaction.guild?.id ?? null);
  }

  public override messageRun(message: Message) {
    return this.#check(message.author.id, message.guild?.id ?? null);
  }

  public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
    return this.#check(interaction.user.id, interaction.guild?.id ?? null);
  }

  async #check(userId: string, guildId: string | null) {
    const blocked = await container.db.access.isUserBlocked(userId, guildId);
    return blocked
      ? this.error({ message: "You are not allowed to use this bot." })
      : this.ok();
  }
}

declare module "@sapphire/framework" {
  interface Preconditions {
    NotBlocked: never;
  }
}
