import { ApplyOptions } from "@sapphire/decorators";
import { PermissionsBitField } from "discord.js";
import { GuildMessageListener } from "#core/module-system/GuildMessageListener.js";
import type { GuildMessage } from "#lib/types.js";
import type { FilterService } from "../services/FilterService.js";
import { swallow } from "#utilities/errors.js";
import { deleteMessageLater } from "#utilities/temporary-message.js";

@ApplyOptions<GuildMessageListener.Options>({ module: "filter" })
export class FilterMessageListener extends GuildMessageListener {
  private get filterService(): FilterService {
    return this.container.stores.get("services").get("filter") as FilterService;
  }

  protected async handle(message: GuildMessage): Promise<void> {
    const { member } = message;
    if (member?.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return;

    if (!this.filterService.has(message.guildId)) {
      await this.filterService.loadGuild(message.guildId);
    }

    const matched = this.filterService.test(message.guildId, message.content);
    if (!matched) return;

    await message.delete().catch(swallow("Filter: delete filtered message"));

    const warn = await message.channel
      .send(
        `${message.author}, your message was removed for containing a filtered term.`,
      )
      .catch(swallow("Filter: send warning"));

    if (warn) deleteMessageLater(warn, undefined, "Filter: delete warning");
  }
}
