import type { ConfigField } from "@lumi/module-runtime";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { type MessageModalSubmit, showPanel } from "./common.js";
import {
  escalationActions,
  escalationEntries,
  escalationModal,
  escalationRemoveModal,
  nextEscalationCount,
  parseEscalationCount,
  parseEscalationDraft,
  renderEscalationEditor,
  serializeEscalation,
  upsertEscalation,
} from "./escalation.js";
import { renderModules, renderSubmodules } from "./moduleList.js";
import {
  enabledConfigField,
  fieldModal,
  fieldValue,
  findField,
  isModuleFeatureEnabled,
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
import { handleRolesModuleAction } from "./roles.js";
import type { HubServices } from "./services.js";
import { handleTempVcModuleAction } from "./tempvc.js";

function pageNumber(raw: string | undefined): number {
  return Number(raw) || 0;
}

async function toggleModule(
  services: HubServices,
  guildId: string,
  moduleName: string,
): Promise<boolean> {
  const loaded = services.moduleLoader.getModule(moduleName);
  if (!loaded?.isSubmodule) return false;
  const wasEnabled = await isModuleFeatureEnabled(
    services,
    guildId,
    moduleName,
  );
  const field = enabledConfigField(services, moduleName);
  if (field) {
    const config = await readModuleConfig(services, guildId, moduleName);
    config[field.key] = !wasEnabled;
    await writeModuleConfig(services, guildId, moduleName, config);
  }
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
  if (
    await handleRolesModuleAction(
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
  if (
    await handleTempVcModuleAction(
      interaction,
      services,
      guildId,
      action,
      target,
      extra,
    )
  ) {
    return true;
  }
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
        if (enabledConfigField(services, target)) {
          const enabled = await isModuleFeatureEnabled(
            services,
            guildId,
            target,
          );
          if (enabled) await services.moduleManager.enable(guildId, target);
          else await services.moduleManager.disable(guildId, target);
        }
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
        const next = !fieldValue(field, config);
        config[field.key] = next;
        await writeModuleConfig(services, guildId, target, config);
        if (field.key === "enabled" && field.type === "boolean") {
          if (next) await services.moduleManager.enable(guildId, target);
          else await services.moduleManager.disable(guildId, target);
        }
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
      if (
        field.type === "escalation" ||
        isPickerField(field) ||
        isSelectField(field)
      ) {
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
        fieldModal(
          target,
          field,
          pageNumber(extra2),
          fieldValue(field, config),
        ),
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
    case "escedit": {
      if (!interaction.isStringSelectMenu()) return true;
      const field = findField(services, target, extra);
      if (field?.type !== "escalation") return true;
      const config = await readModuleConfig(services, guildId, target);
      const entries = escalationEntries(
        fieldValue(field, config),
        escalationActions(field),
      );
      const entry = entries.find(
        (item) => String(item.count) === interaction.values[0],
      );
      await interaction.showModal(
        escalationModal(field, target, pageNumber(extra2), entry),
      );
      return true;
    }
    case "escnew": {
      const field = findField(services, target, extra);
      if (field?.type !== "escalation") return true;
      const config = await readModuleConfig(services, guildId, target);
      const entries = escalationEntries(
        fieldValue(field, config),
        escalationActions(field),
      );
      await interaction.showModal(
        escalationModal(
          field,
          target,
          pageNumber(extra2),
          undefined,
          nextEscalationCount(entries),
        ),
      );
      return true;
    }
    case "escremove": {
      const field = findField(services, target, extra);
      if (field?.type !== "escalation") return true;
      const config = await readModuleConfig(services, guildId, target);
      const entries = escalationEntries(
        fieldValue(field, config),
        escalationActions(field),
      );
      await interaction.showModal(
        escalationRemoveModal(field, target, pageNumber(extra2), entries),
      );
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

async function replyEscalationError(
  interaction: ModalSubmitInteraction,
  message: string,
): Promise<void> {
  await interaction.reply(
    ephemeralCard(makeErrorCard("Invalid Escalation", message)),
  );
}

async function renderEscalationAfterChange(
  interaction: ModalSubmitInteraction,
  field: ConfigField,
  moduleName: string,
  pageIndex: string,
  value: unknown,
  notice: string,
): Promise<void> {
  const card = renderEscalationEditor(
    interaction,
    field,
    moduleName,
    pageNumber(pageIndex),
    value,
    notice,
  );
  if (interaction.isFromMessage()) {
    await (interaction as MessageModalSubmit).update(card);
  } else {
    await interaction.reply(ephemeralCard(card));
  }
}

export async function handleEscalationSave(
  interaction: ModalSubmitInteraction,
  services: HubServices,
  guildId: string,
  moduleName: string,
  fieldKey: string,
  pageIndex: string,
  originalCount: string,
): Promise<void> {
  const field = findField(services, moduleName, fieldKey);
  if (field?.type !== "escalation") {
    await replyEscalationError(
      interaction,
      "That escalation setting no longer exists.",
    );
    return;
  }

  const actions = escalationActions(field);
  let draft: ReturnType<typeof parseEscalationDraft>;
  try {
    draft = parseEscalationDraft(
      interaction.fields.getTextInputValue("count"),
      interaction.fields.getTextInputValue("action"),
      interaction.fields.getTextInputValue("duration"),
      actions,
    );
  } catch (error) {
    await replyEscalationError(
      interaction,
      error instanceof Error ? error.message : "Enter a valid rule.",
    );
    return;
  }

  const config = await readModuleConfig(services, guildId, moduleName);
  const entries = escalationEntries(fieldValue(field, config), actions);
  const previous = originalCount === "new" ? null : Number(originalCount);
  const base =
    previous !== null && Number.isInteger(previous)
      ? entries.filter((entry) => entry.count !== previous)
      : entries;
  const next = upsertEscalation(base, draft);
  config[fieldKey] = serializeEscalation(next, actions);
  await writeModuleConfig(services, guildId, moduleName, config);
  const quarantineMissing =
    draft.action === "quarantine" &&
    (typeof config.quarantineRoleId !== "string" ||
      config.quarantineRoleId.length === 0);
  await renderEscalationAfterChange(
    interaction,
    field,
    moduleName,
    pageIndex,
    config[fieldKey],
    quarantineMissing
      ? `Saved the ${draft.count}-warning rule. Quarantine Role is not set - set it in Moderation settings.`
      : `Saved the ${draft.count}-warning rule.`,
  );
}

export async function handleEscalationRemove(
  interaction: ModalSubmitInteraction,
  services: HubServices,
  guildId: string,
  moduleName: string,
  fieldKey: string,
  pageIndex: string,
): Promise<void> {
  const field = findField(services, moduleName, fieldKey);
  if (field?.type !== "escalation") {
    await replyEscalationError(
      interaction,
      "That escalation setting no longer exists.",
    );
    return;
  }

  let count: number;
  try {
    count = parseEscalationCount(interaction.fields.getTextInputValue("count"));
  } catch (error) {
    await replyEscalationError(
      interaction,
      error instanceof Error ? error.message : "Enter a valid warning count.",
    );
    return;
  }

  const actions = escalationActions(field);
  const config = await readModuleConfig(services, guildId, moduleName);
  const entries = escalationEntries(fieldValue(field, config), actions);
  if (!entries.some((entry) => entry.count === count)) {
    await replyEscalationError(
      interaction,
      `No escalation rule exists for ${count} warnings.`,
    );
    return;
  }

  const next = entries.filter((entry) => entry.count !== count);
  config[fieldKey] = serializeEscalation(next, actions);
  await writeModuleConfig(services, guildId, moduleName, config);
  await renderEscalationAfterChange(
    interaction,
    field,
    moduleName,
    pageIndex,
    config[fieldKey],
    `Removed the ${count}-warning rule.`,
  );
}
