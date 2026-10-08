import { fetchTyped } from "#lib/i18n/index.js";
import { deriveRepoNameFromUrl } from "@lumi/contracts";
import { getUtility } from "#lib/module-system/Utility.js";
import type { DownloaderUtility } from "../../utilities/DownloaderUtility.js";
import type { GuildSettingsUtility } from "../../utilities/GuildSettingsUtility.js";
import {
  hasAdminPermit,
  hasOwnerPermit,
  renderSettings,
} from "../../services/hub-panel.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#lib/ui/cards.js";
import { HubAddonModalId } from "../../constants.js";
import { defineInteraction } from "#lib/interactions/interaction-def.js";
import type { Container } from "#lib/services.js";
import { MessageFlags, type ModalSubmitInteraction } from "discord.js";

export const hubPanelModal = defineInteraction({
  prefix: ["lumi:prefixmodal", HubAddonModalId.prefix],
  async run(services: Container, interaction: ModalSubmitInteraction) {
    let data: { kind: "prefix" } | { kind: "addon"; action: string } | null =
      null;
    if (interaction.customId === "lumi:prefixmodal")
      data = { kind: "prefix" as const };
    else {
      const parsed = HubAddonModalId.parse(interaction.customId);
      if (parsed) data = { kind: "addon" as const, action: parsed.action };
    }
    if (!data) return;
    const settings: GuildSettingsUtility = getUtility("guild-settings");
    const downloader: DownloaderUtility = getUtility("downloader");
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
      return submitAddon(services, downloader, interaction, data.action);
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

    return submitPrefix(services, settings, interaction);
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
        const rawName = interaction.fields.getTextInputValue("name")?.trim();
        const name = rawName || deriveRepoNameFromUrl(url);
        const branch =
          interaction.fields.getTextInputValue("branch")?.trim() || "main";
        await downloader.addRepo(services, name, url, branch);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Repository Added",
              `You're all set. **${name}** was cloned and added.`,
            ),
          ),
        );
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
