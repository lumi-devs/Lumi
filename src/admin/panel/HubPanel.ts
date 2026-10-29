import { type CardReply, ephemeralCard, makeErrorCard } from "@lumi/ui";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { hasAdminAccess, roleIdsFrom } from "../access.js";
import { handleAddonInteraction } from "./addons.js";
import type { MessageModalSubmit } from "./common.js";
import { renderHubPanel, renderSettings } from "./hubViews.js";
import { renderModules, renderSubmodules } from "./moduleList.js";
import {
  fieldModal,
  fieldValue,
  findField,
  isMulti,
  isPickerField,
  isSelectField,
  parseFieldInput,
  prefixModal,
  readModuleConfig,
  renderFieldEditor,
  renderModuleDetail,
  writeModuleConfig,
} from "./moduleSettings.js";
import { parseSubmoduleTogglePages } from "./modules.js";
import { PermitPanel } from "./PermitPanel.js";
import type { HubServices } from "./services.js";

type PanelInteraction =
  | ButtonInteraction
  | AnySelectMenuInteraction
  | ModalSubmitInteraction;

/** Swap the panel message in place after acknowledging the interaction. */
async function show(
  interaction: PanelInteraction,
  render: () => Promise<CardReply>,
): Promise<void> {
  await interaction.deferUpdate();
  await interaction.editReply(await render());
}

/** Persist a module toggle and return its previous state for the notice. */
async function toggleModule(
  services: HubServices,
  guildId: string,
  moduleName: string,
): Promise<boolean> {
  const wasEnabled = services.moduleLoader.isEnabled(guildId, moduleName);
  if (wasEnabled) await services.moduleManager.disable(guildId, moduleName);
  else await services.moduleManager.enable(guildId, moduleName);
  return wasEnabled;
}

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
      ephemeralCard(makeErrorCard("Lumi", "This panel has expired. Run `/lumi` again.")),
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
      await show(interaction, () => renderHubPanel(action, interaction, services));
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
    case "mods": {
      await show(interaction, () =>
        renderModules(interaction, services, Number(target) || 0),
      );
      return true;
    }
    case "modopen": {
      if (interaction.isStringSelectMenu()) return true;
      await show(interaction, () =>
        renderModuleDetail(interaction, services, target, Number(extra) || 0),
      );
      return true;
    }
    case "modsubs": {
      await show(interaction, () =>
        renderSubmodules(
          interaction,
          services,
          target,
          Number(extra) || 0,
          Number(extra2) || 0,
        ),
      );
      return true;
    }
    case "modsubtoggle": {
      await interaction.deferUpdate();
      const loaded = services.moduleLoader.getModule(target);
      if (!loaded?.supermodule) return true;

      const { originPage, childPage } = parseSubmoduleTogglePages(extra ?? "");
      const enabled = await toggleModule(services, guildId, target);
      await interaction.editReply(
        await renderSubmodules(
          interaction,
          services,
          loaded.supermodule,
          originPage,
          childPage,
          `${loaded.manifest.displayName} ${enabled ? "disabled" : "enabled"}.`,
        ),
      );
      return true;
    }
    case "modtoggle": {
      await interaction.deferUpdate();
      const enabled = await toggleModule(services, guildId, target);
      await interaction.editReply(
        await renderModuleDetail(
          interaction,
          services,
          target,
          Number(extra) || 0,
          `Module ${enabled ? "disabled" : "enabled"}.`,
        ),
      );
      return true;
    }
    case "modreset": {
      await show(interaction, async () => {
        await writeModuleConfig(services, guildId, target, {});
        return renderModuleDetail(
          interaction,
          services,
          target,
          Number(extra) || 0,
          "Settings reset to defaults.",
        );
      });
      return true;
    }
    case "modsec": {
      if (!interaction.isStringSelectMenu()) return true;
      await show(interaction, () =>
        renderModuleDetail(
          interaction,
          services,
          target,
          Number(interaction.values[0]) || 0,
        ),
      );
      return true;
    }
    case "modbool": {
      const field = findField(services, target, extra);
      if (!field) return true;
      await show(interaction, async () => {
        const config = await readModuleConfig(services, guildId, target);
        config[field.key] = !fieldValue(field, config);
        await writeModuleConfig(services, guildId, target, config);
        return renderModuleDetail(
          interaction,
          services,
          target,
          Number(extra2) || 0,
        );
      });
      return true;
    }
    case "modfield": {
      const field = findField(services, target, extra);
      if (!field) return true;
      const section = Number(extra2) || 0;
      if (isPickerField(field) || isSelectField(field)) {
        await show(interaction, () =>
          renderFieldEditor(interaction, services, target, extra, section),
        );
      } else {
        const config = await readModuleConfig(services, guildId, target);
        await interaction.showModal(
          fieldModal(target, field, section, fieldValue(field, config)),
        );
      }
      return true;
    }
    case "modinput": {
      const field = findField(services, target, extra);
      if (!field) return true;
      const config = await readModuleConfig(services, guildId, target);
      await interaction.showModal(
        fieldModal(target, field, Number(extra2) || 0, fieldValue(field, config)),
      );
      return true;
    }
    case "modpick": {
      if (!interaction.isAnySelectMenu()) return true;
      const field = findField(services, target, extra);
      if (!field) return true;
      const chosen = interaction.values;
      const selectedValue = isMulti(field) ? chosen : chosen[0];
      await show(interaction, async () => {
        const config = await readModuleConfig(services, guildId, target);
        if (
          selectedValue === undefined ||
          (Array.isArray(selectedValue) && selectedValue.length === 0)
        ) {
          delete config[field.key];
        } else {
          config[field.key] = selectedValue;
        }
        await writeModuleConfig(services, guildId, target, config);
        return renderFieldEditor(
          interaction,
          services,
          target,
          extra,
          Number(extra2) || 0,
        );
      });
      return true;
    }
    case "modclear": {
      await show(interaction, async () => {
        const config = await readModuleConfig(services, guildId, target);
        delete config[extra];
        await writeModuleConfig(services, guildId, target, config);
        return renderFieldEditor(
          interaction,
          services,
          target,
          extra,
          Number(extra2) || 0,
        );
      });
      return true;
    }
    case "setprefix": {
      await interaction.showModal(prefixModal());
      return true;
    }
    case "setreset": {
      await show(interaction, async () => {
        await services.configService.reset(guildId, "prefix");
        return renderSettings(interaction, services);
      });
      return true;
    }
    default: {
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
        ephemeralCard(makeErrorCard("Invalid Prefix", "The prefix cannot be empty or contain spaces.")),
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
    const [, , moduleName, fieldKey, sectionRaw] = parts;
    const field = findField(services, moduleName, fieldKey);
    if (!field) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Unknown Setting", "That setting no longer exists.")),
      );
      return;
    }
    const raw = interaction.fields.getTextInputValue("value");
    const config = await readModuleConfig(services, guildId, moduleName);
    try {
      if (raw.trim().length === 0) delete config[field.key];
      else config[field.key] = parseFieldInput(field, raw);
    } catch (error) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Value",
            error instanceof Error ? error.message : "Enter a valid value.",
          ),
        ),
      );
      return;
    }
    await writeModuleConfig(services, guildId, moduleName, config);
    const card = await renderModuleDetail(
      interaction,
      services,
      moduleName,
      Number(sectionRaw) || 0,
      `${field.label} updated.`,
    );
    if (interaction.isFromMessage()) await (interaction as MessageModalSubmit).update(card);
    else await interaction.reply(card);
    return;
  }

}
