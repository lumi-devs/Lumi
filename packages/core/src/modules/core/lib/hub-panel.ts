import type { LumiT } from "#lib/i18n/index.js";
import { getService } from "#lib/module-system/Service.js";
import { hasRequiredPermit } from "#lib/permissions/index.js";
import { loadFeatures } from "#modules/core/lib/config-panel.js";
import { buildAddonRepoModulesView } from "#modules/core/ui/addons.js";
import { buildHubView, buildSettingsView } from "#modules/core/ui/hub.js";
import { buildPermissionsView } from "#modules/core/ui/permissions.js";
import { Emojis } from "#utilities/assets.js";
import { container, UserError } from "@sapphire/framework";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";

/** Any interaction the hub panel can be driven from. */
export type PanelInteraction =
  ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

/** The error every hub-panel handler throws once the `admin.*` check fails. */
export const accessDenied = () =>
  new UserError({
    identifier: "AccessDenied",
    message: `${Emojis.CROSS} You need the \`admin.*\` permit to manage this server.`,
  });

/** Wick-style permit checks for the hub panel: same nodes /lumi and /download require. */
export const hasAdminPermit = (interaction: PanelInteraction) =>
  hasRequiredPermit(interaction, "admin.*");

export const hasOwnerPermit = (interaction: PanelInteraction) =>
  hasRequiredPermit(interaction, "owner.*");

/** Re-renders the hub landing card in place; the interaction must be deferred. */
export async function renderHub(interaction: ButtonInteraction, t?: LumiT) {
  const guildId = interaction.guildId!;
  const [features, settings] = await Promise.all([
    loadFeatures(guildId),
    container.db.config.getGuildSettings(guildId),
  ]);
  return interaction.editReply(
    buildHubView(
      {
        moduleCount: features.length,
        enabledCount: features.filter((f) => f.guildEnabled).length,
        prefix: settings.prefix,
        locale: settings.locale,
        iconUrl:
          interaction.guild?.iconURL() ??
          container.client.user?.displayAvatarURL(),
      },
      t,
    ),
  );
}

export async function renderSettings(interaction: PanelInteraction, t?: LumiT) {
  const settings = await container.db.config.getGuildSettings(
    interaction.guildId!,
  );
  return interaction.editReply(
    buildSettingsView({ prefix: settings.prefix, locale: settings.locale }, t),
  );
}

/** Flattens the guild's custom and enforced permits into one revocable list. */
async function loadPermissionOverrides(guildId: string) {
  const permits = await container.db.permissions.getGuildPermits(guildId);
  return [
    ...permits.custom.map((c) => ({
      commandPath: c.permit,
      modelType: c.targetType,
      modelId: c.targetId,
      enforced: false,
    })),
    ...permits.enforced.map((c) => ({
      commandPath: c.permit,
      modelType: c.targetType,
      modelId: c.targetId,
      enforced: true,
    })),
  ];
}

export async function renderPermissions(
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  page = 0,
  t?: LumiT,
) {
  const overrides = await loadPermissionOverrides(interaction.guildId!);
  return interaction.editReply(buildPermissionsView(overrides, page, t));
}

/**
 * Renders one repository's browsable module list, marking the modules already
 * installed *from that repository* as such.
 *
 * @param page - Zero-based page index; the view clamps out-of-range values.
 */
export async function renderRepoModules(
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  repoName: string,
  t?: LumiT,
  page = 0,
) {
  const downloader = getService("downloader");
  const [modules, installedDetailed] = await Promise.all([
    downloader.getModulesInRepo(repoName),
    downloader.getInstalledModulesDetailed(),
  ]);
  const installed = new Set(
    installedDetailed
      .filter((row) => row.repo.name === repoName)
      .map((row) => row.moduleName),
  );

  return interaction.editReply(
    buildAddonRepoModulesView(
      repoName,
      modules.map((moduleInfo) => ({
        name: moduleInfo.name,
        version: moduleInfo.version,
        short: moduleInfo.short,
        hidden: moduleInfo.hidden,
        isInstalled: installed.has(moduleInfo.name),
      })),
      page,
      t,
    ),
  );
}
