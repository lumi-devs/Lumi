import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { type Message, PermissionsBitField } from "discord.js";
import type { FilterService } from "../services/FilterService.js";
import { checkModulesEnabled } from "#lib/module-check.js";
import { swallow } from "#utilities/errors.js";

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class FilterMessageListener extends Listener {
  private get filterService(): FilterService {
    return this.container.stores.get("services").get("filter") as FilterService;
  }

  public async run(message: Message): Promise<void> {
    if (!message.inGuild() || message.author.bot) return;

    const states = await checkModulesEnabled(message.guildId, ["filter"]);
    if (!states.get("filter")) return;

    const { member } = message;
    if (member?.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return;

    // Lazily load the guild's matcher on first message if not already warm
    if (!this.filterService.has(message.guildId)) {
      await this.filterService.loadGuild(message.guildId);
    }

    const matched = await this.filterService.test(
      message.guildId,
      message.content,
    );
    if (!matched) return;

    await message.delete().catch(swallow("Filter: delete filtered message"));

    const warn = await message.channel
      .send(
        `${message.author}, your message was removed for containing a filtered term.`,
      )
      .catch(swallow("Filter: send warning"));

    if (warn)
      setTimeout(
        () => warn.delete().catch(swallow("Filter: delete warning")),
        5_000,
      );
  }
}
