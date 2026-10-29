import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import { isBotOwner } from "@lumi/permits";
import type { InstalledAddon } from "@lumi/downloader";
import type { HubServices } from "./services.js";
import { errorMessage } from "../../core/errors.js";
import { cut } from "./common.js";
import {
  addRepoModal,
  intervalLabel,
  renderAddonPanel,
  short,
  type AddonView,
} from "./addonViews.js";

type AddonInteraction =
  | ButtonInteraction
  | AnySelectMenuInteraction
  | ModalSubmitInteraction;

async function show(
  interaction: AddonInteraction,
  services: HubServices,
  view: AddonView,
  notice?: string,
): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }
  await interaction.editReply(await renderAddonPanel(interaction, services, view, notice));
}

async function fail(
  interaction: AddonInteraction,
  title: string,
  body: string,
): Promise<void> {
  const card = ephemeralCard(makeErrorCard(title, body));
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(card);
  } else {
    await interaction.reply(card);
  }
}

function errorText(error: unknown): string {
  return errorMessage(error);
}

export async function handleAddonInteraction(
  interaction: ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction,
  services: HubServices,
): Promise<boolean> {
  const id = interaction.customId;
  if (id !== "lumi:addon" && !id.startsWith("lumi:addon:")) return false;

  if (!isBotOwner(interaction.user.id)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Bot Owners Only", "Add-ons can only be managed by bot owners."),
      ),
    );
    return true;
  }

  const [, , action, target, extra] = id.split(":");

  try {
    switch (action) {
      case undefined:
      case "home":
        await show(interaction, services, { kind: "home" });
        return true;
      case "repos":
        await show(interaction, services, { kind: "repos" });
        return true;
      case "installed":
        await show(interaction, services, { kind: "installed" });
        return true;
      case "auto":
        await show(interaction, services, { kind: "auto" });
        return true;
      case "repo": {
        if (!interaction.isStringSelectMenu()) return true;
        await show(interaction, services, { kind: "repo", name: interaction.values[0]! });
        return true;
      }
      case "view": {
        if (!target) return false;
        await show(interaction, services, { kind: "repo", name: target });
        return true;
      }
      case "browse": {
        if (!target) return false;
        await show(interaction, services, {
          kind: "browse",
          name: target,
          page: Number(extra) || 0,
        });
        return true;
      }
      case "manage": {
        if (!interaction.isStringSelectMenu()) return true;
        await show(interaction, services, { kind: "manage", name: interaction.values[0]! });
        return true;
      }
      case "addrepo":
        if (!interaction.isButton()) return true;
        await interaction.showModal(addRepoModal());
        return true;
      case "addrepomodal": {
        if (!interaction.isModalSubmit()) return true;
        const name = interaction.fields.getTextInputValue("name").trim().toLowerCase();
        const url = interaction.fields.getTextInputValue("url").trim();
        const branch = interaction.fields.getTextInputValue("branch").trim();
        await interaction.deferUpdate();
        try {
          await services.addons.addRepo(name, url, branch || undefined);
          await show(interaction, services, { kind: "repo", name }, `Repository ${name} added.`);
        } catch (error) {
          await fail(interaction, "Could Not Add Repository", errorText(error));
        }
        return true;
      }
      case "update": {
        if (!target) return false;
        await interaction.deferUpdate();
        const report = await services.addons.updateRepo(target);
        const notice = report.failures.length
          ? `Update rolled back: ${report.failures.map((failure) => `${failure.module} (${failure.error})`).join("; ")}`
          : report.changed
            ? report.updated.length > 0
              ? `Updated ${report.updated.length} add-on(s) to ${short(report.newCommit)}.`
              : "Repository updated; no unpinned add-ons to reload."
            : "Already up to date.";
        await show(interaction, services, { kind: "repo", name: target }, cut(notice, 500));
        return true;
      }
      case "remove": {
        if (!target) return false;
        await interaction.deferUpdate();
        await services.addons.removeRepo(target);
        await show(interaction, services, { kind: "repos" }, `Repository ${target} removed.`);
        return true;
      }
      case "install": {
        if (!target || !extra) return false;
        await interaction.deferUpdate();
        await services.addons.install(target, extra);
        await show(
          interaction,
          services,
          { kind: "browse", name: target, page: 0 },
          `Installed ${extra}.`,
        );
        return true;
      }
      case "uninstall": {
        if (!target) return false;
        await interaction.deferUpdate();
        await services.addons.uninstall(target);
        await show(interaction, services, { kind: "installed" }, `Uninstalled ${target}.`);
        return true;
      }
      case "pin": {
        if (!target) return false;
        await interaction.deferUpdate();
        const addon: InstalledAddon | undefined = (
          await services.addons.listInstalled()
        ).find((entry) => entry.name === target);
        if (!addon) {
          await fail(interaction, "Not Installed", `${target} is not installed.`);
          return true;
        }
        await services.addons.setPinned(target, !addon.pinned);
        await show(
          interaction,
          services,
          { kind: "manage", name: target },
          `${target} ${addon.pinned ? "unpinned" : "pinned"}.`,
        );
        return true;
      }
      case "autotoggle": {
        await interaction.deferUpdate();
        const state = await services.addons.getAutoUpdate();
        const next = await services.addons.setAutoUpdate({ enabled: !state.enabled });
        await show(
          interaction,
          services,
          { kind: "auto" },
          `Auto-update ${next.enabled ? "enabled" : "disabled"}.`,
        );
        return true;
      }
      case "interval": {
        if (!interaction.isStringSelectMenu()) return true;
        await interaction.deferUpdate();
        const minutes = Number(interaction.values[0]) || 360;
        await services.addons.setAutoUpdate({ intervalMinutes: minutes });
        await show(
          interaction,
          services,
          { kind: "auto" },
          `Interval set to ${intervalLabel(minutes)}.`,
        );
        return true;
      }
      default:
        return false;
    }
  } catch (error) {
    await fail(interaction, "Add-on Action Failed", errorText(error));
    return true;
  }
}
