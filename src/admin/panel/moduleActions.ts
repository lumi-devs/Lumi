import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { type MessageModalSubmit, showPanel } from "./common.js";
import { renderModules, renderSubmodules } from "./moduleList.js";
import {
  fieldModal,
  fieldValue,
  findField,
  isMulti,
  isPickerField,
  isSelectField,
  parseFieldInput,
  readModuleConfig,
  renderFieldEditor,
  renderModuleDetail,
  writeModuleConfig,
} from "./moduleSettings.js";
import { parseSubmoduleTogglePages } from "./modules.js";
import type { HubServices } from "./services.js";

function pageNumber(raw: string | undefined): number {
  return Number(raw) || 0;
}


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





export async function handleModuleAction(
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  services: HubServices,
  guildId: string,
  action: string,
  target: string,
  extra: string,
  extra2: string,
): Promise<boolean> {
  switch (action) {
    case "mods": {
      await showPanel(interaction, () =>
        renderModules(interaction, services, pageNumber(target)),
      );
      return true;
    }
    case "modopen": {
      if (interaction.isStringSelectMenu()) return true;
      await showPanel(interaction, () =>
        renderModuleDetail(interaction, services, target, pageNumber(extra)),
      );
      return true;
    }
    case "modsubs": {
      await showPanel(interaction, () =>
        renderSubmodules(
          interaction,
          services,
          target,
          pageNumber(extra),
          pageNumber(extra2),
        ),
      );
      return true;
    }
    case "modsubtoggle": {
      await interaction.deferUpdate();
      const loaded = services.moduleLoader.getModule(target);
      if (!loaded?.supermodule) return true;

      const { originPage, childPage } = parseSubmoduleTogglePages(extra);
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
      await showPanel(interaction, async () => {
        const enabled = await toggleModule(services, guildId, target);
        return renderModuleDetail(
          interaction,
          services,
          target,
          pageNumber(extra),
          `Module ${enabled ? "disabled" : "enabled"}.`,
        );
      });
      return true;
    }
    case "modreset": {
      await showPanel(interaction, async () => {
        await writeModuleConfig(services, guildId, target, {});
        return renderModuleDetail(
          interaction,
          services,
          target,
          pageNumber(extra),
          "Settings reset to defaults.",
        );
      });
      return true;
    }
    case "modsec": {
      if (!interaction.isStringSelectMenu()) return true;
      await showPanel(interaction, () =>
        renderModuleDetail(
          interaction,
          services,
          target,
          pageNumber(interaction.values[0]),
        ),
      );
      return true;
    }
    case "modbool": {
      const field = findField(services, target, extra);
      if (!field) return true;
      await showPanel(interaction, async () => {
        const config = await readModuleConfig(services, guildId, target);
        config[field.key] = !fieldValue(field, config);
        await writeModuleConfig(services, guildId, target, config);
        return renderModuleDetail(
          interaction,
          services,
          target,
          pageNumber(extra2),
        );
      });
      return true;
    }
    case "modfield": {
      const field = findField(services, target, extra);
      if (!field) return true;
      const pageIndex = pageNumber(extra2);
      if (isPickerField(field) || isSelectField(field)) {
        await showPanel(interaction, () =>
          renderFieldEditor(interaction, services, target, extra, pageIndex),
        );
      } else {
        const config = await readModuleConfig(services, guildId, target);
        await interaction.showModal(
          fieldModal(target, field, pageIndex, fieldValue(field, config)),
        );
      }
      return true;
    }
    case "modinput": {
      const field = findField(services, target, extra);
      if (!field) return true;
      const config = await readModuleConfig(services, guildId, target);
      await interaction.showModal(
        fieldModal(target, field, pageNumber(extra2), fieldValue(field, config)),
      );
      return true;
    }
    case "modpick": {
      if (!interaction.isAnySelectMenu()) return true;
      const field = findField(services, target, extra);
      if (!field) return true;
      const chosen = interaction.values;
      const selectedValue = isMulti(field) ? chosen : chosen[0];
      await showPanel(interaction, async () => {
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
          pageNumber(extra2),
        );
      });
      return true;
    }
    case "modclear": {
      await showPanel(interaction, async () => {
        const config = await readModuleConfig(services, guildId, target);
        delete config[extra];
        await writeModuleConfig(services, guildId, target, config);
        return renderFieldEditor(
          interaction,
          services,
          target,
          extra,
          pageNumber(extra2),
        );
      });
      return true;
    }
    default:
      return false;
  }
}


export async function handleModuleModal(
  interaction: ModalSubmitInteraction,
  services: HubServices,
  guildId: string,
  moduleName: string,
  fieldKey: string,
  pageIndex: string,
): Promise<void> {
  const field = findField(services, moduleName, fieldKey);
  if (!field) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Unknown Setting", "That setting no longer exists."),
      ),
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
    pageNumber(pageIndex),
    `${field.label} updated.`,
  );
  if (interaction.isFromMessage()) {
    await (interaction as MessageModalSubmit).update(card);
  } else {
    await interaction.reply(card);
  }
}
