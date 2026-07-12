import {
  InteractionHandler,
  InteractionHandlerTypes,
  UserError,
  container,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import {
  GuildMember,
  TextInputStyle,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { getService } from "#lib/module-system/Service.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import {
  PermissionLevel,
  resolvePermissionLevel,
  type PermissionModelType,
} from "#lib/permissions/index.js";
import { Emojis } from "#lib/utilities/assets.js";
import {
  ephemeralCard,
  makeErrorCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import { loadFeatures, buildFeatureListView } from "#lib/config-panel.js";
import {
  buildHubView,
  buildSettingsView,
  buildPermissionsView,
  buildAddonsView,
  DEFAULT_PREFIX,
} from "#lib/hub-panel.js";
import type { GuildSettingsService } from "#lib/services/GuildSettingsService.js";
import type { PermissionService } from "#lib/services/PermissionService.js";

const PERMISSION_MODEL_TYPES = [
  "role",
  "user",
  "channel",
  "category",
  "everyone",
] as const satisfies readonly PermissionModelType[];

const isModelType = (v: string): v is PermissionModelType =>
  (PERMISSION_MODEL_TYPES as readonly string[]).includes(v);

const accessDenied = () =>
  new UserError({
    identifier: "AccessDenied",
    message: `${Emojis.CROSS} You need the Admin permission level to manage this server.`,
  });

/** Resolves the interacting member's permission level within this guild. */
export async function resolveLevel(
  interaction:
    | ButtonInteraction
    | AnySelectMenuInteraction
    | ModalSubmitInteraction,
): Promise<PermissionLevel> {
  if (!interaction.guild) return PermissionLevel.USER;
  const member =
    interaction.member instanceof GuildMember ? interaction.member : null;
  return resolvePermissionLevel({
    userId: interaction.user.id,
    guild: interaction.guild,
    member,
  });
}

async function renderHub(interaction: ButtonInteraction) {
  const guildId = interaction.guildId!;
  const [features, settings] = await Promise.all([
    loadFeatures(guildId),
    container.db.config.getGuildSettings(guildId),
  ]);
  return interaction.editReply(
    buildHubView({
      moduleCount: features.length,
      enabledCount: features.filter((f) => f.guildEnabled).length,
      prefix: settings.prefix,
      locale: settings.locale,
    }),
  );
}

async function renderSettings(
  interaction: ButtonInteraction | AnySelectMenuInteraction,
) {
  const settings = await container.db.config.getGuildSettings(
    interaction.guildId!,
  );
  return interaction.editReply(
    buildSettingsView({ prefix: settings.prefix, locale: settings.locale }),
  );
}

async function renderPermissions(
  interaction: ButtonInteraction | AnySelectMenuInteraction,
) {
  const overrides = await container.db.permissions.getAllPermissionOverrides(
    interaction.guildId!,
  );
  return interaction.editReply(buildPermissionsView(overrides));
}

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class HubPanelButtonHandler extends BaseInteractionHandler {
  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("lumi:")) return this.none();
    const [, action, sub] = interaction.customId.split(":");
    return this.some({ action, sub });
  }

  public async run(
    interaction: ButtonInteraction,
    { action, sub }: { action: string; sub?: string },
  ) {
    if (!interaction.inGuild()) return;
    const level = await resolveLevel(interaction);
    if (level < PermissionLevel.ADMIN) throw accessDenied();

    if (action === "prefix" && sub === "set")
      return this.#openPrefixModal(interaction);
    if (action === "perm" && (sub === "allow" || sub === "deny"))
      return this.#openPermModal(interaction, sub === "allow");

    await this.acknowledge(interaction);

    switch (action) {
      case "home":
        return renderHub(interaction);
      case "tab":
        return this.#renderTab(interaction, sub);
      case "prefix":
        if (sub === "reset") {
          await this.settings.resetPrefix(interaction.guildId).catch(() => {});
          return renderSettings(interaction);
        }
        return undefined;
      default:
        return undefined;
    }
  }

  async #renderTab(interaction: ButtonInteraction, tab: string | undefined) {
    switch (tab) {
      case "modules": {
        const features = await loadFeatures(interaction.guildId!);
        return interaction.editReply(buildFeatureListView(features));
      }
      case "permissions":
        return renderPermissions(interaction);
      case "settings":
        return renderSettings(interaction);
      case "addons":
        return interaction.editReply(buildAddonsView());
      default:
        return undefined;
    }
  }

  #openPrefixModal(interaction: ButtonInteraction) {
    const modal = new ModalBuilder()
      .setCustomId("lumi:prefixmodal")
      .setTitle("Set Command Prefix")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("prefix")
            .setLabel("New prefix")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(5)
            .setPlaceholder(`e.g. ${DEFAULT_PREFIX}`),
        ),
      );
    return interaction.showModal(modal);
  }

  #openPermModal(interaction: ButtonInteraction, allow: boolean) {
    const field = (
      id: string,
      label: string,
      placeholder: string,
      required: boolean,
    ) =>
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(required)
          .setPlaceholder(placeholder.slice(0, 100)),
      );

    const modal = new ModalBuilder()
      .setCustomId(`lumi:permmodal:${allow ? "allow" : "deny"}`)
      .setTitle(allow ? "Allow a Command" : "Deny a Command")
      .addComponents(
        field("command", "Command", "e.g. ban or config set", true),
        field(
          "type",
          "Target type",
          "role, user, channel, category, or everyone",
          true,
        ),
        field(
          "target",
          "Target ID or mention",
          "leave blank for everyone",
          false,
        ),
      );
    return interaction.showModal(modal);
  }
}

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class HubPanelSelectHandler extends BaseInteractionHandler {
  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  private get perms(): PermissionService {
    return getService("permissions");
  }

  public override parse(interaction: AnySelectMenuInteraction) {
    if (interaction.customId === "lumi:setlang") return this.some("lang");
    if (interaction.customId === "lumi:permrm") return this.some("permrm");
    return this.none();
  }

  public async run(interaction: AnySelectMenuInteraction, kind: string) {
    if (!interaction.inGuild() || !interaction.isStringSelectMenu()) return;
    if ((await resolveLevel(interaction)) < PermissionLevel.ADMIN)
      throw accessDenied();
    await this.acknowledge(interaction);

    if (kind === "lang") {
      const language = interaction.values[0];
      if (language)
        await this.settings
          .setLanguage(interaction.guildId, language)
          .catch(() => {});
      return renderSettings(interaction);
    }

    const parts = (interaction.values[0] ?? "").split("|");
    const [modelType, modelId] = parts;
    const commandPath = parts.slice(2).join("|");
    if (commandPath && modelId && modelType && isModelType(modelType)) {
      await this.perms
        .resetOverride(interaction.guildId, commandPath, modelType, modelId)
        .catch(() => {});
    }
    return renderPermissions(interaction);
  }
}

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class HubPanelModalHandler extends InteractionHandler {
  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  private get perms(): PermissionService {
    return getService("permissions");
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (interaction.customId === "lumi:prefixmodal")
      return this.some({ kind: "prefix" as const });
    if (interaction.customId === "lumi:permmodal:allow")
      return this.some({ kind: "perm" as const, allow: true });
    if (interaction.customId === "lumi:permmodal:deny")
      return this.some({ kind: "perm" as const, allow: false });
    return this.none();
  }

  public async run(
    interaction: ModalSubmitInteraction,
    data: { kind: "prefix" } | { kind: "perm"; allow: boolean },
  ) {
    if (!interaction.inGuild()) return;
    if ((await resolveLevel(interaction)) < PermissionLevel.ADMIN)
      return this.#deny(interaction);

    return data.kind === "prefix"
      ? this.#submitPrefix(interaction)
      : this.#submitPermission(interaction, data.allow);
  }

  async #submitPrefix(interaction: ModalSubmitInteraction) {
    const prefix = interaction.fields.getTextInputValue("prefix").trim();
    try {
      await this.settings.setPrefix(interaction.guildId!, prefix);
    } catch (err) {
      return this.#error(interaction, "Invalid Prefix", err);
    }

    const settings = await container.db.config.getGuildSettings(
      interaction.guildId!,
    );
    return this.#render(
      interaction,
      buildSettingsView({ prefix: settings.prefix, locale: settings.locale }),
    );
  }

  async #submitPermission(interaction: ModalSubmitInteraction, allow: boolean) {
    const command = interaction.fields
      .getTextInputValue("command")
      .trim()
      .toLowerCase();
    const type = interaction.fields
      .getTextInputValue("type")
      .trim()
      .toLowerCase();
    const target =
      interaction.fields.getTextInputValue("target").trim() || null;

    if (!isModelType(type))
      return this.#error(
        interaction,
        "Invalid Type",
        "Target type must be one of: role, user, channel, category, everyone.",
      );

    const root = command.split(/\s+/)[0];
    if (!root || !this.container.stores.get("commands").has(root))
      return this.#error(
        interaction,
        "Unknown Command",
        `\`${command}\` is not a registered command.`,
      );

    try {
      await this.perms.addOverride(
        interaction.guildId!,
        command,
        type,
        target,
        allow,
      );
    } catch (err) {
      return this.#error(interaction, "Invalid Target", err);
    }

    const overrides = await container.db.permissions.getAllPermissionOverrides(
      interaction.guildId!,
    );
    return this.#render(interaction, buildPermissionsView(overrides));
  }

  #render(interaction: ModalSubmitInteraction, view: CardReply) {
    if (interaction.isFromMessage()) return interaction.update(view);
    return interaction.reply(ephemeralCard(view));
  }

  #deny(interaction: ModalSubmitInteraction) {
    return interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Permission Denied",
          "You need the Admin permission level to manage this server.",
        ),
      ),
    );
  }

  #error(interaction: ModalSubmitInteraction, title: string, err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err ?? "Unknown error");
    return interaction.reply(ephemeralCard(makeErrorCard(title, message)));
  }
}
