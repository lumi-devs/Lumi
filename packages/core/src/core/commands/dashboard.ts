import { ApplyOptions } from "@sapphire/decorators";
import type { Args } from "@sapphire/framework";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import type { Message } from "discord.js";
import { makeSuccessCard, makeErrorCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { errorFrom } from "#utilities/errors.js";
import type { GuildSettingsService } from "#core/services/GuildSettingsService.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "dashboard",
  description: "Manage dashboard configuration and layout",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.GUILD_OWNER,
  subcommands: [{ name: "layout", messageRun: "messageRunLayout" }],
})
export class DashboardCommand extends BaseSubcommand {
  private get guildSettingsService(): GuildSettingsService {
    return this.container.stores
      .get("services")
      .get("guild-settings") as GuildSettingsService;
  }

  public async messageRunLayout(message: Message, args: Args): Promise<void> {
    const guildId = message.guild!.id;
    const rawLayout = await args.rest("string").catch(() => null);

    if (!rawLayout) {
      await message.reply(
        makeErrorCard(
          "Missing Arguments",
          "Usage: `,dashboard layout <json_array>`",
        ),
      );
      return;
    }

    try {
      const layout = await this.guildSettingsService.setDashboardLayout(
        guildId,
        rawLayout,
      );
      this.container.logger.info(
        `[Dashboard] ${Emojis.GEAR} Layout updated for guild ${guildId} by ${message.author.tag}`,
      );
      await message.reply(
        makeSuccessCard(
          `${Emojis.GEAR} Layout Updated`,
          `Dashboard layout updated successfully to: \`${JSON.stringify(layout)}\``,
        ),
      );
    } catch (err: unknown) {
      await message.reply(
        makeErrorCard("Failed to Update Layout", errorFrom(err).message),
      );
    }
  }
}
