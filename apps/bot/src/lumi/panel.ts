import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import {
  MessageFlags,
  TextInputStyle,
  type ChannelSelectMenuInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type Message,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type RoleSelectMenuInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
} from "discord.js";
import { TTL } from "@lumi/redis";
import { evaluatePermit, isBotOwner } from "@lumi/module-kit";
import type { CommandContext, LumiServices } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  type CardReply,
} from "@lumi/ui";
import { HubId, initialState, type HubState, type HubTab } from "./state.ts";
import {
  PermitOrderPerPage,
  buildAddonInstalledView,
  buildAddonRepoModulesView,
  buildAddonReposView,
  buildAddonsView,
  buildHubView,
  buildModuleDetailView,
  buildModulesView,
  buildPermitAssignTargetView,
  buildPermitExplainPickerView,
  buildPermitExplainView,
  buildPermitOrderView,
  buildPermitPickerView,
  buildPermissionsView,
  buildSettingsView,
  flattenAssignments,
  type AddonStats,
  type ModuleEntry,
} from "./views.ts";

const PrefixModalPrefix = "lumi:prefix:modal";

export async function runHub(ctx: CommandContext): Promise<unknown> {
  const guild = ctx.guild;
  const guildId = ctx.guildId;
  if (!guild || !guildId) {
    return ctx.reply(makeErrorCard("Server Only", "The control panel is only available in a server."));
  }

  const state = initialState();
  state.channelId = ctx.channel?.id;
  const reply = await ctx.reply(await renderState(ctx.services, guild, state));

  let message: Message | null = null;
  if (ctx.isSlash) {
    message = await (ctx.source as ChatInputCommandInteraction).fetchReply().catch(() => null);
  } else if (reply && typeof reply === "object" && "id" in reply) {
    message = reply as Message;
  }

  if (message) {
    await ctx.services.redis
      .set(
        ctx.services.keys.panelSession(message.id),
        `${ctx.user.id}:${guildId}`,
        "EX",
        TTL.panelSession,
      )
      .catch((error: unknown) => {
        ctx.services.logger.error(
          { error, guildId, messageId: message?.id },
          "failed to record lumi panel session",
        );
      });
  } else {
    ctx.services.logger.warn(
      { guildId, userId: ctx.user.id },
      "lumi panel opened but its message could not be resolved for the interaction session",
    );
  }

  return reply;
}

/**
 * Entry point for the global interaction dispatcher. Panel state is encoded in
 * custom IDs and the invoking user is remembered in Redis, so any replica can
 * handle a click without an in-memory collector owning the message.
 */
export async function handleHubInteraction(
  services: LumiServices,
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
): Promise<void> {
  const messageId = interaction.isModalSubmit()
    ? modalMessageId(interaction.customId)
    : interaction.message?.id;
  const guild = interaction.guild;
  if (!messageId || !guild || !interaction.guildId) {
    await interaction
      .reply(
        ephemeralCard(
          makeErrorCard("Panel Unavailable", "This control panel is no longer attached to a server message."),
        ),
      )
      .catch(() => undefined);
    return;
  }

  const key = services.keys.panelSession(messageId);
  const session = await services.redis.get(key).catch(() => null);
  const [ownerId, sessionGuild] = session?.split(":") ?? [];
  if (ownerId !== interaction.user.id || sessionGuild !== interaction.guildId) {
    await interaction
      .reply(
        ephemeralCard(
          makeErrorCard(
            "Panel Locked",
            "This panel belongs to another member. Run `/lumi` to open your own.",
          ),
        ),
      )
      .catch(() => undefined);
    return;
  }

  await services.redis.expire(key, TTL.panelSession).catch(() => undefined);

  const state = stateForInteraction(interaction);
  try {
    if (interaction.isModalSubmit()) {
      await handleModal(services, guild, interaction);
      return;
    }
    await handleComponent(services, guild, state, interaction);
  } catch (error) {
    services.logger.error(
      { error, guildId: interaction.guildId, customId: interaction.customId },
      "lumi panel interaction failed",
    );
    const payload = ephemeralCard(
      makeErrorCard(
        "Panel Error",
        error instanceof Error ? error.message : "Unexpected error while updating the panel.",
      ),
    );
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => undefined);
    } else {
      await interaction.reply(payload).catch(() => undefined);
    }
  }
}

function stateForInteraction(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
): HubState {
  const state = initialState();
  state.channelId = interaction.channelId ?? undefined;
  const id = interaction.customId;

  if (id.startsWith("lumi:tab:")) {
    state.tab = id.slice("lumi:tab:".length) as HubTab;
  } else if (id.startsWith("lumi:perm")) {
    state.tab = "permissions";
  } else if (id.startsWith("lumi:module") || id.startsWith("lumi:cfg")) {
    state.tab = "modules";
  } else if (id.startsWith("lumi:prefix")) {
    state.tab = "settings";
  } else if (id.startsWith("lumi:addons")) {
    state.tab = "addons";
  }

  return state;
}

async function renderState(
  services: LumiServices,
  guild: Guild,
  state: HubState,
): Promise<CardReply> {
  switch (state.tab) {
    case "home":
      return renderHome(services, guild);
    case "modules":
      return state.moduleName
        ? renderModuleDetail(services, guild, state.moduleName, state.modulesPage)
        : renderModules(services, guild, state.modulesPage);
    case "permissions":
      return renderPermissions(services, guild, state);
    case "settings":
      return renderSettings(services, guild);
    case "addons":
      return renderAddons(services, state);
  }
}

async function renderHome(services: LumiServices, guild: Guild): Promise<CardReply> {
  const statuses = services.moduleControl.status();
  const enabled = await Promise.all(
    statuses.map(
      async (status) =>
        status.state === "loaded" && (await services.db.modules.isEnabled(guild.id, status.name)),
    ),
  );
  const guildRecord = await services.db.guild.get(guild.id);
  return buildHubView({
    moduleCount: statuses.length,
    enabledCount: enabled.filter(Boolean).length,
    prefix: guildRecord?.prefix ?? services.runtime.defaultPrefix,
    iconUrl: guild.iconURL() ?? services.client.user?.displayAvatarURL() ?? null,
  });
}

async function renderModules(
  services: LumiServices,
  guild: Guild,
  page: number,
): Promise<CardReply> {
  const statuses = services.moduleControl.status();
  const entries: ModuleEntry[] = await Promise.all(
    statuses.map(async (status) => ({
      status,
      globalEnabled: await services.db.modules.isGlobalEnabled(status.name),
      guildEnabled: await services.db.modules.isGuildEnabled(guild.id, status.name),
    })),
  );
  return buildModulesView(entries, page);
}

async function renderModuleDetail(
  services: LumiServices,
  guild: Guild,
  name: string,
  page: number,
): Promise<CardReply> {
  const loaded = services.modules.get(name);
  const status = services.moduleControl.status().find((entry) => entry.name === name);
  if (!loaded || !status) return renderModules(services, guild, page);

  const [globalEnabled, guildEnabled, raw] = await Promise.all([
    services.db.modules.isGlobalEnabled(name),
    services.db.modules.isGuildEnabled(guild.id, name),
    services.db.config.getModuleConfig(guild.id, name),
  ]);

  let config: Record<string, unknown> = raw;
  try {
    config = loaded.definition.config.parse(raw) as Record<string, unknown>;
  } catch (error) {
    services.logger.warn({ error, module: name, guildId: guild.id }, "module config failed validation");
  }

  return buildModuleDetailView({
    status,
    globalEnabled,
    guildEnabled,
    fields: loaded.definition.configFields ?? [],
    config,
    page,
  });
}

async function renderSettings(services: LumiServices, guild: Guild): Promise<CardReply> {
  const record = await services.db.guild.get(guild.id);
  return buildSettingsView({
    prefix: record?.prefix ?? services.runtime.defaultPrefix,
    prefixIsDefault: record?.prefix === null || record?.prefix === undefined,
  });
}

async function renderAddons(services: LumiServices, state: HubState): Promise<CardReply> {
  const [repos, installed] = await Promise.all([
    services.addons.listRepos(),
    services.addons.listInstalled(),
  ]);

  if (state.addonsView === "repos") {
    const counts = new Map<string, number>();
    for (const module of installed) {
      if (!module.repoName) continue;
      counts.set(module.repoName, (counts.get(module.repoName) ?? 0) + 1);
    }
    return buildAddonReposView(
      repos.map((repo) => ({
        name: repo.name,
        url: repo.url,
        branch: repo.branch,
        commit: repo.commit,
        installedCount: counts.get(repo.name) ?? 0,
      })),
    );
  }

  if (state.addonsView === "installed") {
    return buildAddonInstalledView(
      installed.map((module) => ({
        moduleName: module.moduleName,
        version: module.version,
        commit: module.commit,
        ...(module.repoName === undefined ? {} : { repoName: module.repoName }),
      })),
      repos.map((repo) => repo.name),
    );
  }

  if (state.addonsView === "browse" && state.addonRepoName) {
    const [available, current] = await Promise.all([
      services.addons.listAvailable(state.addonRepoName),
      services.addons.listInstalled(),
    ]);
    const installedNames = new Set(current.map((module) => module.moduleName));
    return buildAddonRepoModulesView(
      state.addonRepoName,
      available.map((module) => ({
        name: module.name,
        displayName: module.displayName,
        description: module.description,
        version: module.version,
        errors: module.errors,
        installed: installedNames.has(module.name),
      })),
      state.addonPage,
    );
  }

  const stats: AddonStats = {
    repoCount: repos.length,
    installedCount: installed.length,
    pendingUpdates: [],
  };
  return buildAddonsView(stats);
}

async function renderPermissions(
  services: LumiServices,
  guild: Guild,
  state: HubState,
): Promise<CardReply> {
  const permits = await services.db.permits.listPermits(guild.id);
  const assignments = flattenAssignments(permits);

  if (state.explainUserId !== undefined) {
    const nodes = [
      ...new Set(
        permits.flatMap((permit) => permit.nodes).filter((node) => node.length > 0),
      ),
    ].sort((a, b) => a.localeCompare(b));

    if (state.explainNode !== undefined) {
      const member = await guild.members.fetch(state.explainUserId).catch(() => null);
      const result = await evaluatePermit(services, {
        guildId: guild.id,
        userId: state.explainUserId,
        channelId: state.channelId,
        member: member ?? undefined,
        guildOwnerId: guild.ownerId,
        node: state.explainNode,
      });
      return buildPermitExplainView(
        state.explainNode,
        `<@${state.explainUserId}>`,
        result.allowed,
        result.verdicts.map((verdict) => ({
          tier: verdict.tier,
          verdict: verdict.verdict,
          ...(verdict.reason === undefined ? {} : { detail: verdict.reason }),
        })),
      );
    }

    return buildPermitExplainPickerView({
      userId: state.explainUserId,
      nodeNames: nodes,
      page: state.explainPage,
    });
  }

  return buildPermissionsView(assignments, state.permissionsPage);
}

/** Returns the order view; used by the order button without overloading state. */
async function renderOrder(services: LumiServices, guild: Guild, page: number): Promise<CardReply> {
  const permits = await services.db.permits.listPermits(guild.id);
  return buildPermitOrderView(permits, page);
}

async function handleComponent(
  services: LumiServices,
  guild: Guild,
  state: HubState,
  interaction: MessageComponentInteraction,
): Promise<void> {
  const id = interaction.customId;

  if (interaction.isStringSelectMenu()) {
    await handleSelect(services, guild, state, interaction);
    return;
  }
  if (
    interaction.isUserSelectMenu() ||
    interaction.isRoleSelectMenu() ||
    interaction.isChannelSelectMenu()
  ) {
    await handleMentionSelect(services, guild, state, interaction);
    return;
  }
  if (!interaction.isButton()) return;

  if (id.startsWith("lumi:tab:")) {
    const tab = id.slice("lumi:tab:".length) as HubTab;
    if (!["home", "modules", "permissions", "settings", "addons"].includes(tab)) return;
    state.tab = tab;
    state.moduleName = undefined;
    state.explainUserId = undefined;
    state.explainNode = undefined;
    state.explainPage = 0;
    state.addonsView = "dashboard";
    state.addonRepoName = undefined;
    state.addonPage = 0;
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:module:open:")) {
    const [, , , name, pageRaw] = id.split(":");
    if (!name) return;
    state.moduleName = name;
    state.modulesPage = Math.max(0, Number(pageRaw) || 0);
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:module:back:")) {
    state.moduleName = undefined;
    state.modulesPage = Math.max(0, Number(id.split(":")[3]) || 0);
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:cfg:bool:")) {
    const [, , , name, key, pageRaw] = id.split(":");
    if (!name || !key) return;
    const loaded = services.modules.get(name);
    if (!loaded) return;
    const raw = await services.db.config.getModuleConfig(guild.id, name);
    let current = false;
    try {
      const parsed = loaded.definition.config.parse(raw) as Record<string, unknown>;
      current = parsed[key] === true;
    } catch {
      current = raw[key] === true;
    }
    await services.db.config.setModuleConfig(guild.id, name, key, !current, {
      actorId: interaction.user.id,
    });
    state.moduleName = name;
    state.modulesPage = Math.max(0, Number(pageRaw) || 0);
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:cfg:reset:")) {
    const [, , , name, pageRaw] = id.split(":");
    if (!name) return;
    await services.db.config.clearModuleConfig(guild.id, name);
    state.moduleName = name;
    state.modulesPage = Math.max(0, Number(pageRaw) || 0);
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:cfg:edit:")) {
    const [, , , name, key, pageRaw] = id.split(":");
    if (!name || !key) return;
    const loaded = services.modules.get(name);
    const field = loaded?.definition.configFields?.find((entry) => entry.key === key);
    if (!loaded || !field) return;
    if (
      field.type === "channel" ||
      field.type === "role" ||
      field.type === "multi-channel" ||
      field.type === "multi-role"
    ) {
      return;
    }

    const raw = await services.db.config.getModuleConfig(guild.id, name);
    await interaction.showModal(
      buildConfigModal(name, field, raw[key], Math.max(0, Number(pageRaw) || 0), interaction.message.id),
    );
    return;
  }

  if (id.startsWith("lumi:module:toggle:")) {
    const [, , , name, pageRaw] = id.split(":");
    if (!name) return;
    const globallyEnabled = await services.db.modules.isGlobalEnabled(name);
    if (!globallyEnabled) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Globally Disabled", `**${name}** is disabled for the whole bot.`)),
      );
      return;
    }
    const current = await services.db.modules.isGuildEnabled(guild.id, name);
    await services.db.modules.setGuild(guild.id, name, !current);
    state.modulesPage = Number(pageRaw) || 0;
    state.moduleName = name;
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:modpage:") || id.startsWith("lumi:permpage:")) {
    const parts = id.split(":");
    if (parts[2] === "indicator") return;
    const page = Number(parts[3]);
    if (!Number.isFinite(page)) return;
    if (id.startsWith("lumi:modpage:")) state.modulesPage = Math.max(0, page);
    else state.permissionsPage = Math.max(0, page);
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:permorder:")) {
    state.orderPage = Math.max(0, Number(id.split(":")[2]) || 0);
    await interaction.update(await renderOrder(services, guild, state.orderPage));
    return;
  }

  if (id.startsWith("lumi:permorderpage:")) {
    const parts = id.split(":");
    if (parts[2] === "indicator") return;
    state.orderPage = Math.max(0, Number(parts[3]) || 0);
    await interaction.update(await renderOrder(services, guild, state.orderPage));
    return;
  }

  if (id.startsWith("lumi:permmove:")) {
    const raw = id.slice("lumi:permmove:".length);
    const [permitIdRaw, direction] = raw.split("|");
    const permitId = Number(permitIdRaw);
    if (!Number.isInteger(permitId) || (direction !== "up" && direction !== "down")) return;
    await services.db.permits.movePermit(guild.id, permitId, direction);
    const permits = await services.db.permits.listPermits(guild.id);
    const index = permits.findIndex((permit) => permit.id === permitId);
    state.orderPage = index < 0 ? 0 : Math.floor(index / PermitOrderPerPage);
    await interaction.update(await renderOrder(services, guild, state.orderPage));
    return;
  }

  if (id.startsWith("lumi:permdel:")) {
    const raw = id.slice("lumi:permdel:".length);
    const [permitIdRaw, targetType, targetId] = raw.split("|");
    const permitId = Number(permitIdRaw);
    if (
      Number.isInteger(permitId) &&
      targetId &&
      (targetType === "user" || targetType === "role" || targetType === "channel")
    ) {
      await services.db.permits.unassignPermit(guild.id, permitId, targetType, targetId);
    }
    state.permissionsPage = 0;
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:permit:grant:")) {
    const kind = id.endsWith("enforced") ? "enforced" : "custom";
    const permits = await services.db.permits.listPermits(guild.id);
    await interaction.update(
      buildPermitPickerView(
        kind,
        permits
          .filter((permit) => permit.kind === kind)
          .map((permit) => ({ id: permit.id, name: permit.name, builtin: permit.builtin })),
      ),
    );
    return;
  }

  if (id === HubId.explain) {
    state.explainUserId = undefined;
    state.explainNode = undefined;
    state.explainPage = 0;
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:permexplainnodepage:")) {
    const parts = id.split(":");
    if (parts[3] === "indicator") return;
    const userId = parts[2];
    if (!userId) return;
    state.explainUserId = userId;
    state.explainNode = undefined;
    state.explainPage = Math.max(0, Number(parts[4]) || 0);
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id === HubId.prefixSet) {
    await interaction.showModal(buildPrefixModal(interaction.message.id));
    return;
  }

  if (id === HubId.prefixReset) {
    await services.db.guild.setPrefix(guild.id, null);
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:addon:")) {
    if (!isBotOwner(services, interaction.user.id)) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Not Allowed", "Only Bot Owners can manage add-ons.")),
      );
      return;
    }

    if (id === HubId.addonAddRepo) {
      await interaction.showModal(buildAddonRepoModal("add", interaction.message.id));
      return;
    }

    if (id === HubId.addonRemoveRepo) {
      await interaction.showModal(buildAddonRepoModal("remove", interaction.message.id));
      return;
    }

    if (id.startsWith("lumi:addon:update:")) {
      const repoName = id.slice("lumi:addon:update:".length);
      await interaction.deferUpdate();
      try {
        const result = await services.addons.updateRepo(repoName);
        await interaction.followUp(
          ephemeralCard(
            makeInfoCard(
              "Repository Updated",
              result.changed
                ? `**${repoName}** moved to \`${result.newSha.slice(0, 7)}\`. Reloaded: ${result.modules.join(", ") || "none"}.`
                : `**${repoName}** is already up to date.`,
            ),
          ),
        );
      } catch (error) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Update Failed",
              error instanceof Error ? error.message : "The repository could not be updated.",
            ),
          ),
        );
      }
      state.addonsView = "repos";
      await interaction.editReply(await renderState(services, guild, state));
      return;
    }

    if (id.startsWith("lumi:addon:uninstall:")) {
      const moduleName = id.slice("lumi:addon:uninstall:".length);
      await interaction.deferUpdate();
      try {
        await services.addons.uninstall(moduleName);
        await interaction.followUp(
          ephemeralCard(makeInfoCard("Add-on Uninstalled", `**${moduleName}** was removed.`)),
        );
      } catch (error) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Uninstall Failed",
              error instanceof Error ? error.message : "The add-on could not be uninstalled.",
            ),
          ),
        );
      }
      state.addonsView = "installed";
      await interaction.editReply(await renderState(services, guild, state));
      return;
    }

    if (id.startsWith("lumi:addon:browse:")) {
      const repoName = id.slice("lumi:addon:browse:".length);
      state.addonsView = "browse";
      state.addonRepoName = repoName;
      state.addonPage = 0;
      await interaction.update(await renderState(services, guild, state));
      return;
    }

    if (id.startsWith("lumi:addon:browsepage:")) {
      const parts = id.split(":");
      const repoName = parts[3];
      const kind = parts[4];
      if (!repoName || kind === "indicator") return;
      state.addonsView = "browse";
      state.addonRepoName = repoName;
      state.addonPage = Math.max(0, Number(parts[5]) || 0);
      await interaction.update(await renderState(services, guild, state));
      return;
    }

    if (id.startsWith("lumi:addon:install:")) {
      const parts = id.split(":");
      const repoName = parts[3];
      const moduleName = parts[4];
      if (!repoName || !moduleName) return;
      await interaction.deferUpdate();
      try {
        await services.addons.install(repoName, moduleName);
        await interaction.followUp(
          ephemeralCard(
            makeInfoCard(
              "Add-on Installed",
              `Installed **${moduleName}** from **${repoName}**. It is available in the Modules tab.`,
            ),
          ),
        );
      } catch (error) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Install Failed",
              error instanceof Error ? error.message : "The add-on could not be installed.",
            ),
          ),
        );
      }
      state.addonsView = "browse";
      state.addonRepoName = repoName;
      await interaction.editReply(await renderState(services, guild, state));
      return;
    }

    if (id.startsWith("lumi:addon:info:")) {
      const parts = id.split(":");
      const repoName = parts[3];
      const moduleName = parts[4];
      if (!repoName || !moduleName) return;
      const available = await services.addons.listAvailable(repoName);
      const moduleInfo = available.find((entry) => entry.name === moduleName);
      if (!moduleInfo) {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Not Found", `**${moduleName}** is not in **${repoName}**.`)),
        );
        return;
      }
      await interaction.reply(
        ephemeralCard(
          makeInfoCard(
            `Module Info: ${moduleInfo.displayName}`,
            [
              `**Name:** \`${moduleInfo.name}\` • **Version:** \`v${moduleInfo.version}\``,
              moduleInfo.description || "*No description provided.*",
              ...(moduleInfo.errors.length > 0
                ? ["", "**Validation errors:**", ...moduleInfo.errors.map((error) => `• ${error}`)]
                : []),
              ...(moduleInfo.warnings.length > 0
                ? ["", "**Warnings:**", ...moduleInfo.warnings.map((warning) => `• ${warning}`)]
                : []),
            ],
          ),
        ),
      );
      return;
    }

    return;
  }

  if (id.startsWith("lumi:addons:")) {
    const view = id.slice("lumi:addons:".length);
    if (view === "repos" || view === "installed") {
      state.addonsView = view;
      await interaction.update(await renderState(services, guild, state));
      return;
    }
    if (view === "updateall") {
      if (!isBotOwner(services, interaction.user.id)) {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Not Allowed", "Only Bot Owners can run add-on updates.")),
        );
        return;
      }
      await interaction.deferUpdate();
      const results = await services.addons.updateAll();
      const updated = results.filter((result) => !("error" in result) && result.changed).length;
      const failed = results.filter((result) => "error" in result);
      await interaction.followUp(
        ephemeralCard(
          makeInfoCard(
            "Add-on Updates",
            [
              `**${updated}** repositor${updated === 1 ? "y" : "ies"} updated.`,
              ...failed.map((result) =>
                "error" in result ? `🔴 **${result.name}** — ${result.error}` : "",
              ),
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        ),
      );
      await interaction.editReply(await renderState(services, guild, state));
    }
  }
}

async function handleModal(
  services: LumiServices,
  guild: Guild,
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith("lumi:addon:modal:")) {
    if (!isBotOwner(services, interaction.user.id)) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Not Allowed", "Only Bot Owners can manage add-ons.")),
      );
      return;
    }
    const action = id.split(":")[3];
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      if (action === "add") {
        const url = interaction.fields.getTextInputValue("url").trim();
        const rawName = interaction.fields.getTextInputValue("name").trim();
        const branch = interaction.fields.getTextInputValue("branch").trim() || "default";
        const name = rawName || deriveRepoName(url);
        if (!name) throw new Error("Provide a repository name or a URL with a usable repository name.");
        await services.addons.addRepo(name, url, branch);
        await interaction.editReply(
          makeInfoCard("Repository Added", `**${name}** was cloned and added.`),
        );
      } else if (action === "remove") {
        const name = interaction.fields.getTextInputValue("name").trim();
        if (!name) throw new Error("Provide the repository name to remove.");
        await services.addons.removeRepo(name);
        await interaction.editReply(
          makeInfoCard("Repository Removed", `**${name}** and its add-ons were removed.`),
        );
      } else {
        await interaction.editReply(
          makeErrorCard("Unknown Action", "That add-on action is not supported."),
        );
        return;
      }
    } catch (error) {
      await interaction.editReply(
        makeErrorCard(
          "Add-on Error",
          error instanceof Error ? error.message : "The add-on action failed.",
        ),
      );
    }

    if (interaction.message?.editable) {
      const state = initialState();
      state.tab = "addons";
      state.addonsView = "repos";
      state.channelId = interaction.channelId ?? undefined;
      await interaction.message.edit(await renderState(services, guild, state)).catch(() => undefined);
    }
    return;
  }

  if (id.startsWith(`${PrefixModalPrefix}:`)) {
    const prefix = interaction.fields.getTextInputValue("prefix").trim();
    if (prefix.length === 0 || prefix.length > 5 || /\s/.test(prefix)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Invalid Prefix", "The prefix must be 1-5 characters with no spaces."),
        ),
      );
      return;
    }

    await services.db.guild.setPrefix(guild.id, prefix);
    const state = initialState();
    state.tab = "settings";
    state.channelId = interaction.channelId ?? undefined;
    await interaction.deferUpdate();
    await interaction.editReply(await renderState(services, guild, state));
    return;
  }

  if (!id.startsWith("lumi:cfg:modal:")) return;

  const [, , , , pageRaw, name, key] = id.split(":");
  if (!name || !key) return;

  const loaded = services.modules.get(name);
  const field = loaded?.definition.configFields?.find((entry) => entry.key === key);
  if (!loaded || !field) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Unknown Setting", "That module setting is no longer available.")),
    );
    return;
  }

  const text = interaction.fields.getTextInputValue("value").trim();
  const value =
    field.type === "number"
      ? Number.parseInt(text, 10)
      : text.length === 0
        ? null
        : text;

  if (field.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (field.min !== undefined && value < field.min) ||
      (field.max !== undefined && value > field.max)
    ) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Value",
            `Enter a whole number between ${field.min ?? "the minimum"} and ${field.max ?? "the maximum"}.`,
          ),
        ),
      );
      return;
    }
  }

  if (value === null) {
    await services.db.config.deleteModuleConfigKey(guild.id, name, key);
  } else {
    await services.db.config.setModuleConfig(guild.id, name, key, value, {
      actorId: interaction.user.id,
    });
  }

  const state = initialState();
  state.tab = "modules";
  state.moduleName = name;
  state.modulesPage = Math.max(0, Number(pageRaw) || 0);
  state.channelId = interaction.channelId ?? undefined;
  await interaction.deferUpdate();
  await interaction.editReply(await renderState(services, guild, state));
}

async function handleSelect(
  services: LumiServices,
  guild: Guild,
  state: HubState,
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const id = interaction.customId;

  if (id === "lumi:addon:browsepick") {
    if (!isBotOwner(services, interaction.user.id)) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Not Allowed", "Only Bot Owners can browse add-ons.")),
      );
      return;
    }
    const repoName = interaction.values[0];
    if (!repoName) return;
    state.addonsView = "browse";
    state.addonRepoName = repoName;
    state.addonPage = 0;
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id === HubId.explainUser) {
    const userId = interaction.values[0];
    if (!userId) return;
    state.explainUserId = userId;
    state.explainNode = undefined;
    state.explainPage = 0;
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:permexplainnode:")) {
    const userId = id.slice("lumi:permexplainnode:".length);
    const node = interaction.values[0];
    if (!userId || !node) return;
    state.explainUserId = userId;
    state.explainNode = node;
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (id.startsWith("lumi:permitpick:")) {
    const kind = id.endsWith("enforced") ? "enforced" : "custom";
    const permitId = Number(interaction.values[0]);
    if (!Number.isInteger(permitId)) return;
    const permit = await services.db.permits.getPermit(guild.id, permitId);
    if (!permit) {
      state.permissionsPage = 0;
      await interaction.update(await renderState(services, guild, state));
      return;
    }
    await interaction.update(buildPermitAssignTargetView(permit.id, permit.name, kind));
  }
}

async function handleMentionSelect(
  services: LumiServices,
  guild: Guild,
  state: HubState,
  interaction:
    | UserSelectMenuInteraction
    | RoleSelectMenuInteraction
    | ChannelSelectMenuInteraction,
): Promise<void> {
  const id = interaction.customId;
  const targetId = interaction.values[0];

  if (id.startsWith("lumi:cfg:channel:") || id.startsWith("lumi:cfg:role:")) {
    const parts = id.split(":");
    const name = parts[3];
    const key = parts[4];
    const page = parts[5];
    if (!name || !key) return;
    const field = services.modules
      .get(name)
      ?.definition.configFields?.find((entry) => entry.key === key);
    const multi = field?.type === "multi-role" || field?.type === "multi-channel";
    let value: string | string[];
    if (multi) {
      value = [...interaction.values];
    } else {
      if (!targetId) return;
      value = targetId;
    }
    await services.db.config.setModuleConfig(guild.id, name, key, value, {
      actorId: interaction.user.id,
    });
    state.moduleName = name;
    state.modulesPage = Math.max(0, Number(page) || 0);
    await interaction.update(await renderState(services, guild, state));
    return;
  }

  if (!targetId) return;
  if (!id.startsWith("lumi:permitassign:")) return;

  const permitId = Number(id.slice("lumi:permitassign:".length));
  if (!Number.isInteger(permitId)) return;

  const targetType = interaction.isRoleSelectMenu() ? "role" : "user";
  await services.db.permits.assignPermit(guild.id, permitId, targetType, targetId);
  state.permissionsPage = 0;
  await interaction.update(await renderState(services, guild, state));
}

function configModalId(
  moduleName: string,
  key: string,
  page: number,
  messageId: string,
): string {
  return `lumi:cfg:modal:${messageId}:${page}:${moduleName}:${key}`;
}

function modalMessageId(customId: string): string | null {
  if (customId.startsWith(`${PrefixModalPrefix}:`)) {
    return customId.slice(PrefixModalPrefix.length + 1) || null;
  }
  if (customId.startsWith("lumi:cfg:modal:")) {
    return customId.split(":")[3] ?? null;
  }
  if (customId.startsWith("lumi:addon:modal:")) {
    return customId.split(":")[4] ?? null;
  }
  return null;
}

function buildConfigModal(
  moduleName: string,
  field: { key: string; label: string; type: string; min?: number | undefined; max?: number | undefined },
  current: unknown,
  page: number,
  messageId: string,
): ModalBuilder {
  const value = current === null || current === undefined ? "" : String(current);
  const hint =
    field.type === "number"
      ? field.min !== undefined && field.max !== undefined
        ? `Between ${field.min} and ${field.max}.`
        : "Enter a whole number."
      : "Leave empty to unset.";

  return new ModalBuilder()
    .setCustomId(configModalId(moduleName, field.key, page, messageId))
    .setTitle(field.label.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(field.label.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setRequired(field.type === "number")
          .setMaxLength(200)
          .setPlaceholder(hint)
          .setValue(value.slice(0, 200)),
      ),
    );
}

function deriveRepoName(url: string): string | null {
  try {
    const last = new URL(url).pathname.replace(/\/+$/, "").split("/").pop() ?? "";
    const name = last.replace(/\.git$/i, "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    return /^[a-z][a-z0-9-]*$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

function buildAddonRepoModal(action: "add" | "remove", messageId: string): ModalBuilder {
  const field = (
    id: string,
    label: string,
    placeholder: string,
    required = true,
  ): ActionRowBuilder<TextInputBuilder> =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(required)
        .setPlaceholder(placeholder),
    );

  if (action === "remove") {
    return new ModalBuilder()
      .setCustomId(HubId.addonModal("remove", messageId))
      .setTitle("Remove Repository")
      .addComponents(field("name", "Repository Name", "e.g. lumi-addons"));
  }

  return new ModalBuilder()
    .setCustomId(HubId.addonModal("add", messageId))
    .setTitle("Add Repository")
    .addComponents(
      field("url", "Repository URL", "https://github.com/owner/repo"),
      field("name", "Repository Name (optional)", "Leave blank to derive from the URL", false),
      field("branch", "Branch (optional)", "default: repository default", false),
    );
}

function buildPrefixModal(messageId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${PrefixModalPrefix}:${messageId}`)
    .setTitle("Set Command Prefix")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("prefix")
          .setLabel("New prefix")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setPlaceholder("e.g. , or !"),
      ),
    );
}
