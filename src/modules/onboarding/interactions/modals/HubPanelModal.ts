import { fetchTyped } from "#src/lib/i18n/Index.js";
import { deriveRepoNameFromUrl } from "#src/contracts/Index.ts";
import { getUtility } from "#src/lib/module-system/Utility.js";
import type { DownloaderUtility } from "#src/modules/admin/utilities/DownloaderUtility.js";
import type { GuildSettingsUtility } from "#src/modules/admin/utilities/GuildSettingsUtility.js";
import {
  hasAdminPermit,
  hasOwnerPermit,
  renderSettings,
} from "#src/modules/onboarding/services/HubPanel.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#src/lib/ui/Cards.js";
import { HubAddonModalId } from "#src/modules/core/Constants.js";
import { defineInteraction } from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
import { MessageFlags, type ModalSubmitInteraction } from "discord.js";
import { buildAddonReposCard } from "#src/modules/admin/ui/Addons.js";

export const hubPanelModal = defineInteraction({
  prefix: ["lumi:prefixmodal", HubAddonModalId.prefix],
  async run(services: Container, interaction: ModalSubmitInteraction) {
    const settings: GuildSettingsUtility = getUtility("guild-settings");
    const downloader: DownloaderUtility = getUtility("downloader");
    if (!interaction.inGuild()) return;

    if (interaction.customId === "lumi:prefixmodal") {
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
      return submitPrefix(services, settings, interaction);
    }

    const parsed = HubAddonModalId.parse(interaction.customId);
    if (!parsed) return;
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
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
    return submitAddon(services, downloader, interaction, parsed.action);
  },
});

async function submitPrefix(
  services: Container,
  settings: GuildSettingsUtility,
  interaction: ModalSubmitInteraction,
) {
    const prefix = interaction.fields.getTextInputValue("prefix").trim();
    try {
      await settings.setPrefix(services, interaction.guildId!, prefix);
    } catch (err) {
      return error(interaction, "Invalid Prefix", err);
    }

    const t = await fetchTyped(interaction);
    return renderSettings(services, interaction, t);
  }

async function submitAddon(
  services: Container,
  downloader: DownloaderUtility,
  interaction: ModalSubmitInteraction,
  action: string,
) {
    try {
      if (action === "add_repo") {
        const url = interaction.fields.getTextInputValue("url").trim();
        const rawName = interaction.fields.getTextInputValue("name").trim();
        const name = rawName || deriveRepoNameFromUrl(url);
        const branch =
          interaction.fields.getTextInputValue("branch").trim() || "default";
        await downloader.addRepo(services, name, url, branch);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Repository Added",
              `You're all set. **${name}** was cloned and added.`,
            ),
          ),
        );
        if (interaction.message?.editable) {
          const t = await fetchTyped(interaction);
          const card = await buildAddonReposCard(services, downloader, t);
          await interaction.message.edit(card).catch(() => null);
        }
      } else if (action === "rm_repo") {
        const name = interaction.fields.getTextInputValue("name").trim();
        await downloader.removeRepo(services, name);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Repository Removed",
              `Removed **${name}** and any modules that were installed from it.`,
            ),
          ),
        );
        if (interaction.message?.editable) {
          const t = await fetchTyped(interaction);
          const card = await buildAddonReposCard(services, downloader, t);
          await interaction.message.edit(card).catch(() => null);
        }
      } else if (action === "install") {
        const repo = interaction.fields.getTextInputValue("repo").trim();
        const module = interaction.fields.getTextInputValue("module").trim();
        await downloader.installModule(services, repo, module);
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
        await downloader.uninstallModule(services, module);
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

function error(interaction: ModalSubmitInteraction, title: string, err: unknown) {
  const message =
    err instanceof Error ? err.message : String(err ?? "Unknown error");
  return interaction.followUp(ephemeralCard(makeErrorCard(title, message)));
}
