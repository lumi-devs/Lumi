import type { LumiT } from "#src/lib/i18n/Index.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import { hasRequiredPermit } from "#src/lib/api/permissions/Index.js";
import { PermitResolver } from "#src/lib/api/permissions/PermitResolver.js";
import { loadFeatures } from "#src/modules/core/services/ConfigPanel.js";
import { buildAddonRepoModulesView } from "#src/modules/core/ui/Addons.js";
import { buildHubView, buildSettingsView } from "#src/modules/core/ui/Hub.js";
import {
  buildPermitExplainPickerView,
  buildPermitExplainView,
  buildPermissionsView,
  buildPermitOrderView,
  type PermitAssignmentRow,
} from "#src/modules/core/ui/Permissions.js";
import { explainPermit } from "#src/lib/api/permissions/PermitResolver.js";
import { memberRoleIds } from "#src/lib/api/permissions/Subject.js";
import { UserError } from "#src/shared/Index.ts";
import type { Container } from "#src/lib/Services.js";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";

type PanelInteraction =
  ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

export const accessDenied = () =>
  new UserError({
    identifier: "AccessDenied",
    message: `❌ You need the \`admin.*\` permit to manage this server.`,
  });

export const hasAdminPermit = (interaction: PanelInteraction) =>
  hasRequiredPermit(interaction, "admin.*");

export const hasOwnerPermit = (interaction: PanelInteraction) =>
  Promise.resolve(PermitResolver.isBotOwner(interaction.user.id));

export async function renderHub(services: Container, interaction: ButtonInteraction, t?: LumiT) {
  const guildId = interaction.guildId!;
  const [features, settings] = await Promise.all([
    loadFeatures(services, guildId),
    services.db.config.getGuildSettings(guildId),
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
          services.client.user?.displayAvatarURL(),
      },
      t,
    ),
  );
}

export async function renderSettings(services: Container, interaction: PanelInteraction, t?: LumiT) {
  const settings = await services.db.config.getGuildSettings(
    interaction.guildId!,
  );
  return interaction.editReply(
    buildSettingsView({ prefix: settings.prefix, locale: settings.locale }, t),
  );
}

async function loadPermitAssignments(
  services: Container,
  guildId: string,
): Promise<PermitAssignmentRow[]> {
  const permits = await services.db.permissions.listPermits(guildId);
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
  services: Container,
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  page = 0,
  t?: LumiT,
) {
  const assignments = await loadPermitAssignments(services, interaction.guildId!);
  return interaction.editReply(buildPermissionsView(assignments, page, t));
}

export async function renderPermitExplain(
  services: Container,
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  opts: { userId?: string | undefined; node?: string | undefined; nodePage?: number | undefined } = {},
  t?: LumiT,
) {
  const perms = getUtility("permissions");
  const names = [
    ...new Set(
      (await perms.listPermits(services, interaction.guildId!)).map((p) => p.name),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const showPicker = () =>
    interaction.editReply(
      buildPermitExplainPickerView(
        { userId: opts.userId, nodeNames: names, nodePage: opts.nodePage },
        t,
      ),
    );
  if (!opts.userId || !opts.node || !names.includes(opts.node)) return showPicker();
  const member = await interaction.guild?.members
    .fetch(opts.userId)
    .catch(() => null);
  const rows = await explainPermit(opts.node, {
    guildId: interaction.guildId!,
    userId: opts.userId,
    roleIds: member ? memberRoleIds(member) : [],
    channelId: interaction.channelId,
    guildOwnerId: interaction.guild?.ownerId ?? null,
  });
  return interaction.editReply(
    buildPermitExplainView(opts.node, `<@${opts.userId}>`, rows),
  );
}

export async function renderPermitOrder(
  services: Container,
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  page = 0,
  t?: LumiT,
) {
  const permits = await services.db.permissions.listPermits(interaction.guildId!);
  return interaction.editReply(
    buildPermitOrderView(
      permits.map((p) => ({ id: p.id, name: p.name, kind: p.kind as "custom" | "enforced", builtin: p.builtin })),
      page,
      t,
    ),
  );
}

export async function renderRepoModules(
  services: Container,
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  repoName: string,
  t?: LumiT,
  page = 0,
) {
  const downloader = getUtility("downloader");
  const [modules, installedDetailed] = await Promise.all([
    downloader.getModulesInRepo(repoName),
    downloader.getInstalledModulesDetailed(services),
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
        author: moduleInfo.author,
        minBotVersion: moduleInfo.min_bot_version,
        hidden: moduleInfo.hidden,
        isInstalled: installed.has(moduleInfo.name),
      })),
      page,
      t,
    ),
  );
}
