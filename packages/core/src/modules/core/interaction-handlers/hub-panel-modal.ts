import { fetchTyped } from "#lib/commands.js";
import { deriveRepoNameFromUrl } from "#lib/downloader/url-helpers.js";
import { getService } from "#lib/module-system/Service.js";
import type { DownloaderService } from "#lib/services/DownloaderService.js";
import type { GuildSettingsService } from "#lib/services/GuildSettingsService.js";
import {
  hasAdminPermit,
  hasOwnerPermit,
  renderSettings,
} from "#modules/core/lib/hub-panel.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "#utilities/cards.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { MessageFlags, type ModalSubmitInteraction } from "discord.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class HubPanelModalHandler extends InteractionHandler {
  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  private get downloader(): DownloaderService {
    return getService("downloader");
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (interaction.customId === "lumi:prefixmodal")
      return this.some({ kind: "prefix" as const });
    if (interaction.customId.startsWith("lumi:addonmodal:"))
      return this.some({
        kind: "addon" as const,
        action: interaction.customId.split(":")[2],
      });
    return this.none();
  }

  public async run(
    interaction: ModalSubmitInteraction,
    data: { kind: "prefix" } | { kind: "addon"; action: string },
  ) {
    if (!interaction.inGuild()) return;

    // Defer immediately (before any permit/DB lookups) to beat Discord's 3s
    // ack window. "addon" gets its own ephemeral reply since it doesn't edit
    // the originating panel message; "prefix" edits it in place.
    if (data.kind === "addon") {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
      if (!(await hasOwnerPermit(interaction)))
        return interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              "Permission Denied",
              "Only Bot Owners can manage addons.",
            ),
          ),
        );
      return this.#submitAddon(interaction, data.action);
    }

    await interaction.deferUpdate();
    if (!(await hasAdminPermit(interaction)))
      return interaction.followUp(
        ephemeralCard(
          makeErrorCard(
            "Permission Denied",
            "You need the `admin.*` permit to manage this server.",
          ),
        ),
      );

    return this.#submitPrefix(interaction);
  }

  async #submitPrefix(interaction: ModalSubmitInteraction) {
    const prefix = interaction.fields.getTextInputValue("prefix").trim();
    try {
      await this.settings.setPrefix(interaction.guildId!, prefix);
    } catch (err) {
      return this.#error(interaction, "Invalid Prefix", err);
    }

    const t = await fetchTyped(interaction);
    return renderSettings(interaction, t);
  }

  async #submitAddon(interaction: ModalSubmitInteraction, action: string) {
    try {
      if (action === "add_repo") {
        const url = interaction.fields.getTextInputValue("url").trim();
        const rawName = interaction.fields.getTextInputValue("name")?.trim();
        const name = rawName || deriveRepoNameFromUrl(url);
        const branch =
          interaction.fields.getTextInputValue("branch")?.trim() || "main";
        await this.downloader.addRepo(name, url, branch);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Repository Added",
              `You're all set. **${name}** was added (or refreshed if it already existed).`,
            ),
          ),
        );
      } else if (action === "rm_repo") {
        const name = interaction.fields.getTextInputValue("name").trim();
        await this.downloader.removeRepo(name);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Repository Removed",
              `Removed **${name}** and any modules that were installed from it.`,
            ),
          ),
        );
      } else if (action === "install") {
        const repo = interaction.fields.getTextInputValue("repo").trim();
        const module = interaction.fields.getTextInputValue("module").trim();
        await this.downloader.installModule(repo, module);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Module Installed",
              `Installed **${module}** from **${repo}**. You can now find it in the Modules tab.`,
            ),
          ),
        );
      } else if (action === "uninstall") {
        const module = interaction.fields.getTextInputValue("module").trim();
        await this.downloader.uninstallModule(module);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Module Uninstalled",
              `Uninstalled **${module}** and removed it from active modules.`,
            ),
          ),
        );
      }
    } catch (err) {
      await interaction.editReply(
        ephemeralCard(
          makeErrorCard(
            "Addon Error",
            err instanceof Error ? err.message : String(err),
          ),
        ),
      );
    }
  }

  #error(interaction: ModalSubmitInteraction, title: string, err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err ?? "Unknown error");
    return interaction.followUp(ephemeralCard(makeErrorCard(title, message)));
  }
}
