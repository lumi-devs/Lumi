import { ApplyOptions } from "@sapphire/decorators";
import type { Args } from "@sapphire/framework";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import type { Message } from "discord.js";
import { makeSuccessCard, makeErrorCard } from "#utilities/cards.js";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<EmberSubcommand.Options>({
  name: "dashboard",
  description: "Manage dashboard configuration and layout",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.GUILD_OWNER,
  subcommands: [{ name: "layout", messageRun: "messageRunLayout" }],
})
export class DashboardCommand extends EmberSubcommand {
  private get guildSettingsService(): import("#core/services/GuildSettingsService.js").GuildSettingsService {
    return this.container.stores
      .get("services")
      .get(
        "guild-settings",
      ) as import("#core/services/GuildSettingsService.js").GuildSettingsService;
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
        `[Dashboard] ${EmberEmojis.GEAR} Layout updated for guild ${guildId} by ${message.author.tag}`,
      );
      await message.reply(
        makeSuccessCard(
          `${EmberEmojis.GEAR} Layout Updated`,
          `Dashboard layout updated successfully to: \`${JSON.stringify(layout)}\``,
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      await message.reply(
        makeErrorCard("Failed to Update Layout", error.message),
      );
    }
  }
}
