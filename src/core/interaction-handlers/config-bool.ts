import {
  InteractionHandlerTypes,
  InteractionHandler,
  UserError,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { StringSelectMenuInteraction } from "discord.js";
import { makeSuccessCard } from "#utilities/cards.js";
import { EmberInteractionHandler } from "../lib/interaction-handler.js";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class ConfigBoolHandler extends EmberInteractionHandler {
  public override parse(interaction: StringSelectMenuInteraction) {
    if (!interaction.customId.startsWith("cfg:bool:")) return this.none();
    const [, , moduleName, key, guildId] = interaction.customId.split(":");
    if (!moduleName || !key || !guildId) return this.none();
    return this.some({ moduleName, key, guildId });
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    {
      moduleName,
      key,
      guildId,
    }: { moduleName: string; key: string; guildId: string },
  ) {
    // 1. Verify Guild ID match to prevent cross-guild injection
    if (interaction.guildId !== guildId) {
      throw new UserError({
        identifier: "SecurityError",
        message: `${EmberEmojis.CROSS} Cross-server configuration is not permitted.`,
      });
    }

    // 2. Re-verify permissions (GUILD_OWNER level)
    if (interaction.guild?.ownerId !== interaction.user.id) {
      throw new UserError({
        identifier: "AccessDenied",
        message: `${EmberEmojis.CROSS} Only the Server Owner can modify these settings.`,
      });
    }

    await this.acknowledge(interaction);

    const value = interaction.values[0] === "true";
    const record = this.container.moduleStore.getRecord(moduleName);
    if (!record) {
      throw new UserError({
        identifier: "UnknownModule",
        message: `Module \`${moduleName}\` no longer exists.`,
      });
    }
    const field = record.meta.configFields?.find(
      (f: import("#core/module-system/Module.js").ConfigField) => f.key === key,
    );
    if (!field) {
      throw new UserError({
        identifier: "UnknownKey",
        message: `Config key \`${key}\` is no longer valid.`,
      });
    }

    await this.container.db.setModuleConfig(guildId, moduleName, key, value);

    this.container.logger.info(
      `[Config] ${EmberEmojis.GEAR} ${interaction.user.tag} set ${moduleName}:${key}=${value} (SelectMenu) in guild ${guildId}`,
    );

    return interaction.editReply({
      ...makeSuccessCard(
        `${EmberEmojis.GEAR} Config Updated`,
        `**${field.label}** set to \`${String(value)}\`.`,
      ),
      components: [],
    });
  }
}
