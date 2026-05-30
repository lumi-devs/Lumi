import { AllFlowsPrecondition, container } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
} from "discord.js";

@ApplyOptions<AllFlowsPrecondition.Options>({ position: 21 })
export class NotIgnoredPrecondition extends AllFlowsPrecondition {
  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return this.ok();
    return this.#check(interaction.guild.id, interaction.channelId);
  }

  public override messageRun(message: Message) {
    if (!message.guild) return this.ok();
    return this.#check(message.guild.id, message.channelId);
  }

  public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
    if (!interaction.guild) return this.ok();
    return this.#check(interaction.guild.id, interaction.channelId);
  }

  async #check(guildId: string, channelId: string) {
    const { guild, channel } = await container.db.access.getIgnoreStatus(
      guildId,
      channelId,
    );
    if (guild) return this.error({ message: "This server is not using Lumi." });
    if (channel)
      return this.error({ message: "Commands are disabled in this channel." });
    return this.ok();
  }
}

declare module "@sapphire/framework" {
  interface Preconditions {
    NotIgnored: never;
  }
}
