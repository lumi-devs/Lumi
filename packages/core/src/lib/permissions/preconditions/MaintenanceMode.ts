import { AllFlowsPrecondition, container } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
} from "discord.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";

@ApplyOptions<AllFlowsPrecondition.Options>({ position: 10 })
export class MaintenanceModePrecondition extends AllFlowsPrecondition {
  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    return this.#check(interaction.user.id);
  }

  public override messageRun(message: Message) {
    return this.#check(message.author.id);
  }

  public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
    return this.#check(interaction.user.id);
  }

  async #check(userId: string) {
    const globalConfig = await container.db.global.getGlobalConfig();
    if (!globalConfig.maintenanceMode) return this.ok();

    if (PermitResolver.isBotOwner(userId)) return this.ok();

    const msg =
      globalConfig.maintenanceMessage ??
      "The bot is currently undergoing maintenance. Please try again later.";
    return this.error({ message: msg });
  }
}

declare module "@sapphire/framework" {
  interface Preconditions {
    MaintenanceMode: never;
  }
}
