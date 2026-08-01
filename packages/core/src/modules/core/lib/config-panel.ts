import type { ModuleMeta } from "#lib/module-system/Module.js";
import { hasRequiredPermit } from "#lib/permissions/index.js";
import type { FeatureListEntry } from "#modules/core/ui/modules.js";
import { Emojis } from "#utilities/assets.js";
import { container, UserError } from "@sapphire/framework";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";

export interface FeatureDetail {
  meta: ModuleMeta;
  config: Record<string, unknown>;
  guildEnabled: boolean;
}

/** Every guild-toggleable module with its current per-guild enabled flag. */
export async function loadFeatures(
  guildId: string,
): Promise<FeatureListEntry[]> {
  return Promise.all(
    container.moduleStore
      .all()
      // Non-disableable modules (e.g. "core", which hosts this very panel)
      // aren't guild-toggleable features - keep them out of the list.
      .filter((record) => record.meta.disableable !== false)
      .map(async (record) => ({
        meta: record.meta,
        guildEnabled: await container.db.modules.isModuleGuildEnabled(
          guildId,
          record.meta.name,
        ),
      })),
  );
}

/**
 * Loads one module's metadata, stored config and enabled flag.
 *
 * @returns `null` when the module is no longer registered — an add-on can be
 * uninstalled while its panel message is still on screen.
 */
export async function loadDetail(
  guildId: string,
  moduleName: string,
): Promise<FeatureDetail | null> {
  const record = container.moduleStore.getRecord(moduleName);
  if (!record) return null;
  const [config, guildEnabled] = await Promise.all([
    container.db.config.getAllModuleConfig(guildId, moduleName),
    container.db.modules.isModuleGuildEnabled(guildId, moduleName),
  ]);
  return { meta: record.meta, config, guildEnabled };
}

/** Re-checks that the interacting user still holds the `admin.*` permit (same node /lumi requires). */
export async function hasPanelAccess(
  interaction:
    ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction,
): Promise<boolean> {
  if (!interaction.guild || !interaction.member) return false;
  return hasRequiredPermit(interaction, "admin.*");
}

/** The error every config-panel handler throws once {@linkcode hasPanelAccess} fails. */
export const configAccessDenied = () =>
  new UserError({
    identifier: "AccessDenied",
    message: `${Emojis.CROSS} You need the Admin permission level to manage configuration.`,
  });
