import type { ModuleMeta } from "@lumi/lib/module-system/meta.js";
import { hasRequiredPermit } from "@lumi/lib/permissions/index.js";
import type { FeatureListEntry } from "@lumi/modules/core/ui/modules.js";
import { UserError } from "@lumi/shared";
import type { Container } from "@lumi/lib/services.js";
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

export async function loadFeatures(
  services: Container,
  guildId: string,
): Promise<FeatureListEntry[]> {
  return Promise.all(
    services.moduleStore
      .all()
      .filter((record) => record.meta.disableable !== false)
      .map(async (record) => ({
        meta: record.meta,
        guildEnabled: await services.db.modules.isModuleGuildEnabled(
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
  services: Container,
  guildId: string,
  moduleName: string,
): Promise<FeatureDetail | null> {
  const record = services.moduleStore.getRecord(moduleName);
  if (!record) return null;
  const [config, guildEnabled] = await Promise.all([
    services.db.config.getAllModuleConfig(guildId, moduleName),
    services.db.modules.isModuleGuildEnabled(guildId, moduleName),
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
    message: `❌ You need the Admin permission level to manage configuration.`,
  });
