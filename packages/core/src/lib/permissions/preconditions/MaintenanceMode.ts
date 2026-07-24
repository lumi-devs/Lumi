import { AllFlowsPrecondition, container } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
} from "discord.js";
import { resolvePermissionLevel } from "#lib/permissions/index.js";

@ApplyOptions<AllFlowsPrecondition.Options>({ position: 10 })
export class MaintenanceModePrecondition extends AllFlowsPrecondition {
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
    const globalConfig = await container.db.global.getGlobalConfig();
    if (!globalConfig.maintenanceMode) return this.ok();

    const permLevel = await resolvePermissionLevel({
      userId,
      guild: guildId ? { id: guildId, ownerId: "" } : null,
      member: null,
    });

    // Bot owners bypass maintenance mode
    if (permLevel >= 10) return this.ok();

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
