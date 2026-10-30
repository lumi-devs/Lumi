import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import type { ModalSubmitInteraction } from "discord.js";
import { hasAdminAccess, roleIdsFrom } from "../access.js";
import { handleAddonInteraction } from "./addons.js";
import {
  type MessageModalSubmit,
  type PanelInteraction,
  showPanel,
} from "./common.js";
import { renderHubPanel, renderSettings } from "./hubViews.js";
import { handleModuleAction, handleModuleModal } from "./moduleActions.js";
import { prefixModal } from "./moduleSettings.js";
import { PermitPanel } from "./PermitPanel.js";
import type { HubServices } from "./services.js";

export async function handleHubInteraction(
  interaction: PanelInteraction,
  services: HubServices,
): Promise<boolean> {
  if (!interaction.customId.startsWith("lumi:")) return false;

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Lumi", "This panel only works in a server.")),
    );
    return true;
  }

  if (interaction.customId.startsWith("lumi:addon:")) {
    await handleAddonInteraction(interaction, services);
    return true;
  }

  const allowed = await hasAdminAccess({
    guildId,
    userId: interaction.user.id,
    roleIds: roleIdsFrom(interaction.member, guildId),
    guildOwnerId: interaction.guild?.ownerId,
    memberPermissions: interaction.memberPermissions,
    client: interaction.client,
    permits: services.permits,
  });
  if (!allowed) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Missing Permissions",
          "You need **Manage Server** or an admin permit to use the Lumi control panel.",
        ),
      ),
    );
    return true;
  }

  if (interaction.isModalSubmit()) {
    await handleHubModal(interaction, services, guildId);
    return true;
  }

  const message = interaction.message;
  if (!message) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Lumi", "This panel has expired. Run `/lumi` again."),
      ),
    );
    return true;
  }

  const ownerId = message.interactionMetadata?.user.id;
  if (ownerId !== undefined && ownerId !== interaction.user.id) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Lumi", "This panel belongs to another user.", {
          footer: "Run `/lumi` to open your own panel",
        }),
      ),
    );
    return true;
  }

  const [, action, target, extra, extra2] = interaction.customId.split(":");

  switch (action) {
    case "home":
    case "modules":
    case "settings":
    case "permits":
    case "addons": {
      await showPanel(interaction, () =>
        renderHubPanel(action, interaction, services),
      );
      return true;
    }
    case "permitpanel": {
      const panel = new PermitPanel({
        permitRepo: services.permits,
        guildId,
        interaction,
        moduleLoader: services.moduleLoader,
      });
      await panel.render();
      return true;
    }
    case "setprefix": {
      await interaction.showModal(prefixModal());
      return true;
    }
    case "setreset": {
      await showPanel(interaction, async () => {
        await services.configService.reset(guildId, "prefix");
        return renderSettings(interaction, services);
      });
      return true;
    }
    default: {
      if (
        await handleModuleAction(
          interaction,
          services,
          guildId,
          action,
          target,
          extra,
          extra2,
        )
      ) {
        return true;
      }
      await interaction.reply(
        ephemeralCard(makeErrorCard("Lumi", "Unknown panel action.")),
      );
      return true;
    }
  }
}

async function handleHubModal(
  interaction: ModalSubmitInteraction,
  services: HubServices,
  guildId: string,
): Promise<void> {
  const parts = interaction.customId.split(":");
  const action = parts[1];

  if (action === "setprefixmodal") {
    const prefix = interaction.fields.getTextInputValue("prefix").trim();
    if (!prefix || /\s/.test(prefix)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Prefix",
            "The prefix cannot be empty or contain spaces.",
          ),
        ),
      );
      return;
    }
    await services.configService.set(guildId, "prefix", prefix);
    const card = await renderSettings(interaction, services);
    if (interaction.isFromMessage()) {
      await (interaction as MessageModalSubmit).update(card);
    } else {
      await interaction.reply(ephemeralCard(card));
    }
    return;
  }

  if (action === "modinput") {
    const [, , moduleName, fieldKey, pageIndex] = parts;
    await handleModuleModal(
      interaction,
      services,
      guildId,
      moduleName,
      fieldKey,
      pageIndex,
    );
  }
}
