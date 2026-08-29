import type { LumiT } from "#lib/i18n/index.js";
import { getService } from "#lib/module-system/Service.js";
import { hasRequiredPermit, PermitResolver } from "#lib/permissions/index.js";
import { loadFeatures } from "#modules/core/lib/config-panel.js";
import { buildAddonRepoModulesView } from "#modules/core/ui/addons.js";
import { buildHubView, buildSettingsView } from "#modules/core/ui/hub.js";
import {
  buildPermissionsView,
  type PermitAssignmentRow,
} from "#modules/core/ui/permissions.js";
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

/** Wick-style permit check for the hub panel: same node /lumi requires. */
export const hasAdminPermit = (interaction: PanelInteraction) =>
  hasRequiredPermit(interaction, "admin.*");

/**
 * Host-level actions (addons, core self-update) are Bot Owner only. This is
 * deliberately not a permit node: `owner.*` is satisfied by every guild owner
 * (PermitResolver's guild-owner bypass), and installing an addon runs
 * third-party code in the bot process.
 */
export const hasOwnerPermit = (interaction: PanelInteraction) =>
  Promise.resolve(PermitResolver.isBotOwner(interaction.user.id));

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

/** Flattens the guild's permits into one revocable assignment-per-row list. */
async function loadPermitAssignments(
  guildId: string,
): Promise<PermitAssignmentRow[]> {
  const permits = await container.db.permissions.listPermits(guildId);
  return permits.flatMap((permit) =>
    permit.assignments.map((a) => ({
      permitId: permit.id,
      permitName: permit.name,
      kind: permit.kind as PermitAssignmentRow["kind"],
      builtin: permit.builtin,
      targetType: a.targetType as PermitAssignmentRow["targetType"],
      targetId: a.targetId,
    })),
  );
}

export async function renderPermissions(
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  page = 0,
  t?: LumiT,
) {
  const assignments = await loadPermitAssignments(interaction.guildId!);
  return interaction.editReply(buildPermissionsView(assignments, page, t));
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
        description: moduleInfo.description,
        endUserDataStatement: moduleInfo.end_user_data_statement,
        hidden: moduleInfo.hidden,
        isInstalled: installed.has(moduleInfo.name),
      })),
      page,
      t,
    ),
  );
}
