import { createChannelSelectMenu, row } from "@lumi/ui";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import {
  getAutoroleConfig,
  saveAutoroleConfig,
} from "../../../../modules/roles/autorole/config.js";
import {
  evaluateAutoroleCandidate,
  selectRolesToAssign,
} from "../../../../modules/roles/autorole/logic.js";
import {
  cancelPendingAutoroles,
  enqueueAutorole,
  processPendingAutoroles,
} from "../../../../modules/roles/autorole/store.js";
import { fetchMember } from "../../../../modules/roles/shared.js";
import { getVoiceRolesConfig } from "../../../../modules/roles/voiceroles/config.js";
import {
  deleteVoiceRoleMapping,
  getVoiceRoleMapping,
  setVoiceRoleEnabled,
  upsertVoiceRoleMapping,
} from "../../../../modules/roles/voiceroles/store.js";
import { getRoleMenusConfig } from "../../../../modules/role-menus/menu/config.js";
import { refreshRoleMenuMessage } from "../../../../modules/role-menus/menu/posting.js";
import type { RoleMenuStyle } from "../../../../modules/role-menus/menu/ui.js";
import {
  backButton,
  type ModuleActionParams,
  type PanelInteraction,
  showPanel,
} from "../common.js";
import type { BotServices } from "../../../core/contracts.js";
import { servicesForModule } from "../../../core/modules.js";
import {
  autoroleAgeModal,
  autoroleDelayModal,
  renderAutoroleFilters,
  renderAutoroleNotice,
  renderAutorolePanel,
} from "./autorole.js";
import {
  deleteGroup,
  postGroup,
  renderRoleMenuDelete,
  renderRoleMenuGroup,
  renderRoleMenuPost,
  renderRoleMenusPanel,
  roleMenuCreateModal,
  roleMenuEditModal,
} from "./roleMenus.js";
import {
  MaxReactionOptions,
  guildChannel,
  isSnowflake,
  pageNumber,
  postCard,
  styleLabel,
} from "./shared.js";
import {
  renderVoiceRoleAdd,
  renderVoiceRoleMapping,
  renderVoiceRoleRemove,
  renderVoiceRolesPanel,
  voiceGraceModal,
} from "./voiceroles.js";

export async function handleRolesModuleAction(
  interaction: PanelInteraction,
  services: BotServices,
  params: ModuleActionParams,
): Promise<boolean> {
  const { guildId, action, target, extra, extra2 } = params;
  if (action === "autorole") {
    await showPanel(interaction, () =>
      renderAutorolePanel(interaction, services, pageNumber(target)),
    );
    return true;
  }
  if (action === "voiceroles") {
    await showPanel(interaction, () =>
      renderVoiceRolesPanel(interaction, services, pageNumber(target)),
    );
    return true;
  }
  if (action === "rolemenus") {
    await showPanel(interaction, () =>
      renderRoleMenusPanel(interaction, services, pageNumber(target)),
    );
    return true;
  }
  if (action.startsWith("ar")) {
    switch (action) {
      case "aroles": {
        if (!interaction.isRoleSelectMenu()) return true;
        const config = await getAutoroleConfig(
          servicesForModule(services),
          guildId,
        );
        config.roleIds = [...interaction.values];
        await saveAutoroleConfig(servicesForModule(services), guildId, config);
        await showPanel(interaction, () =>
          renderAutorolePanel(
            interaction,
            services,
            pageNumber(target),
            "✅ Autoroles updated.",
          ),
        );
        return true;
      }
      case "ardelay": {
        if (!interaction.isButton()) return true;
        const config = await getAutoroleConfig(
          servicesForModule(services),
          guildId,
        );
        await interaction.showModal(
          autoroleDelayModal(config, pageNumber(target)),
        );
        return true;
      }
      case "arfilters": {
        await showPanel(interaction, () =>
          renderAutoroleFilters(interaction, services, pageNumber(target)),
        );
        return true;
      }
      case "arage": {
        if (!interaction.isButton()) return true;
        const config = await getAutoroleConfig(
          servicesForModule(services),
          guildId,
        );
        await interaction.showModal(
          autoroleAgeModal(config, pageNumber(target)),
        );
        return true;
      }
      case "arrequired":
      case "arignored": {
        if (!interaction.isRoleSelectMenu()) return true;
        const config = await getAutoroleConfig(
          servicesForModule(services),
          guildId,
        );
        if (action === "arrequired")
          config.requiredRoleIds = [...interaction.values];
        else config.ignoredRoleIds = [...interaction.values];
        await saveAutoroleConfig(servicesForModule(services), guildId, config);
        await showPanel(interaction, () =>
          renderAutoroleFilters(
            interaction,
            services,
            pageNumber(target),
            "✅ Filters updated.",
          ),
        );
        return true;
      }
      case "arignorebots":
      case "aronlyjoin": {
        if (!interaction.isButton()) return true;
        const config = await getAutoroleConfig(
          servicesForModule(services),
          guildId,
        );
        if (action === "arignorebots") config.ignoreBots = !config.ignoreBots;
        else config.onlyOnJoin = !config.onlyOnJoin;
        await saveAutoroleConfig(servicesForModule(services), guildId, config);
        await showPanel(interaction, () =>
          renderAutoroleFilters(
            interaction,
            services,
            pageNumber(target),
            "✅ Filters updated.",
          ),
        );
        return true;
      }
      case "arrun": {
        if (!interaction.isButton()) return true;
        await interaction.deferUpdate();
        const result = await processPendingAutoroles(
          servicesForModule(services),
          { guildId, force: true },
        );
        await interaction.editReply(
          await renderAutorolePanel(
            interaction,
            services,
            pageNumber(target),
            `✅ Processed ${result.processed}; failed ${result.failed}.`,
          ),
        );
        return true;
      }
      case "arpause": {
        if (!interaction.isButton()) return true;
        const config = await getAutoroleConfig(
          servicesForModule(services),
          guildId,
        );
        config.paused = !config.paused;
        await saveAutoroleConfig(servicesForModule(services), guildId, config);
        await showPanel(interaction, () =>
          renderAutorolePanel(
            interaction,
            services,
            pageNumber(target),
            config.paused ? "⏸️ Queue paused." : "▶️ Queue resumed.",
          ),
        );
        return true;
      }
      case "arcancel": {
        if (!interaction.isButton()) return true;
        const cancelled = await cancelPendingAutoroles(
          servicesForModule(services),
          guildId,
        );
        await showPanel(interaction, () =>
          renderAutorolePanel(
            interaction,
            services,
            pageNumber(target),
            `🗑️ Cancelled ${cancelled} pending ${cancelled === 1 ? "entry" : "entries"}.`,
          ),
        );
        return true;
      }
      case "arqueue": {
        if (!interaction.isUserSelectMenu()) return true;
        const userId = interaction.values[0];
        const guild = interaction.guild;
        if (!userId || !guild) return true;
        const member = await fetchMember(guild, userId);
        if (!member) {
          await renderAutoroleNotice(
            interaction,
            services,
            "❌ That member is not in this server.",
          );
          return true;
        }
        const module = servicesForModule(services);
        const config = await getAutoroleConfig(module, guildId);
        const decision = evaluateAutoroleCandidate(
          {
            isBot: member.user.bot,
            accountAgeMs: Date.now() - member.user.createdTimestamp,
            roleIds: [...member.roles.cache.keys()],
            isJoin: false,
          },
          config,
        );
        if (!decision.eligible) {
          await renderAutoroleNotice(
            interaction,
            services,
            `❌ Not eligible: ${decision.reason}`,
          );
          return true;
        }
        const roleIds = selectRolesToAssign(config.roleIds, [
          ...member.roles.cache.keys(),
        ]);
        await enqueueAutorole(module, {
          guildId,
          userId,
          roleIds,
          delaySeconds: 0,
        });
        const result = await processPendingAutoroles(module, {
          guildId,
          userId,
          force: true,
        });
        await showPanel(interaction, () =>
          renderAutorolePanel(
            interaction,
            services,
            pageNumber(target),
            `✅ Queued <@${userId}> — processed ${result.processed}, failed ${result.failed}.`,
          ),
        );
        return true;
      }
      default:
        return false;
    }
  }

  if (action.startsWith("vr")) {
    switch (action) {
      case "vrnew": {
        if (!interaction.isChannelSelectMenu()) return true;
        const channelId = interaction.values[0];
        if (!isSnowflake(channelId)) return true;
        await showPanel(interaction, () =>
          renderVoiceRoleAdd(
            interaction,
            services,
            channelId,
            null,
            pageNumber(target),
          ),
        );
        return true;
      }
      case "vrnewcat": {
        if (!interaction.isChannelSelectMenu()) return true;
        if (!isSnowflake(target)) return true;
        const categoryId = interaction.values[0] ?? null;
        await showPanel(interaction, () =>
          renderVoiceRoleAdd(
            interaction,
            services,
            target,
            categoryId,
            pageNumber(extra),
          ),
        );
        return true;
      }
      case "vrnewrole": {
        if (!interaction.isRoleSelectMenu()) return true;
        if (!isSnowflake(target)) return true;
        const roleId = interaction.values[0];
        if (!roleId) return true;
        const categoryId = extra === "none" ? null : extra;
        const config = await getVoiceRolesConfig(
          servicesForModule(services),
          guildId,
        );
        await upsertVoiceRoleMapping(servicesForModule(services), {
          guildId,
          channelId: target,
          categoryId,
          roleId,
          graceSeconds: config.defaultGraceSeconds,
        });
        await showPanel(interaction, () =>
          renderVoiceRoleMapping(
            interaction,
            services,
            target,
            pageNumber(extra2),
            "✅ Mapping created.",
          ),
        );
        return true;
      }
      case "vrpage": {
        await showPanel(interaction, () =>
          renderVoiceRolesPanel(interaction, services, pageNumber(target)),
        );
        return true;
      }
      case "vrpick": {
        if (!interaction.isStringSelectMenu()) return true;
        const channelId = interaction.values[0];
        if (!channelId) return true;
        await showPanel(interaction, () =>
          renderVoiceRoleMapping(
            interaction,
            services,
            channelId,
            pageNumber(target),
          ),
        );
        return true;
      }
      case "vr": {
        if (!isSnowflake(target)) return true;
        await showPanel(interaction, () =>
          renderVoiceRoleMapping(
            interaction,
            services,
            target,
            pageNumber(extra),
          ),
        );
        return true;
      }
      case "vrcat": {
        if (!interaction.isChannelSelectMenu()) return true;
        if (!isSnowflake(target)) return true;
        const categoryId = interaction.values[0] ?? null;
        const mapping = await getVoiceRoleMapping(
          servicesForModule(services),
          guildId,
          target,
        );
        if (!mapping) return true;
        await upsertVoiceRoleMapping(servicesForModule(services), {
          guildId,
          channelId: target,
          categoryId,
          roleId: mapping.roleId,
          graceSeconds: mapping.graceSeconds,
        });
        await showPanel(interaction, () =>
          renderVoiceRoleMapping(
            interaction,
            services,
            target,
            pageNumber(extra),
            categoryId ? "✅ Category updated." : "✅ Category cleared.",
          ),
        );
        return true;
      }
      case "vrtoggle": {
        if (!interaction.isButton()) return true;
        if (!isSnowflake(target)) return true;
        const mapping = await getVoiceRoleMapping(
          servicesForModule(services),
          guildId,
          target,
        );
        if (!mapping) return true;
        await setVoiceRoleEnabled(
          servicesForModule(services),
          guildId,
          target,
          !mapping.enabled,
        );
        await showPanel(interaction, () =>
          renderVoiceRoleMapping(
            interaction,
            services,
            target,
            pageNumber(extra),
            mapping.enabled ? "⛔ Mapping disabled." : "✅ Mapping enabled.",
          ),
        );
        return true;
      }
      case "vrgrace": {
        if (!interaction.isButton()) return true;
        if (!isSnowflake(target)) return true;
        const mapping = await getVoiceRoleMapping(
          servicesForModule(services),
          guildId,
          target,
        );
        if (!mapping) return true;
        await interaction.showModal(
          voiceGraceModal(target, pageNumber(extra), mapping.graceSeconds),
        );
        return true;
      }
      case "vrremove": {
        if (!isSnowflake(target)) return true;
        await showPanel(interaction, () =>
          renderVoiceRoleRemove(
            interaction,
            services,
            target,
            pageNumber(extra),
          ),
        );
        return true;
      }
      case "vrremoveconfirm": {
        if (!isSnowflake(target)) return true;
        await deleteVoiceRoleMapping(
          servicesForModule(services),
          guildId,
          target,
        );
        await showPanel(interaction, () =>
          renderVoiceRolesPanel(
            interaction,
            services,
            pageNumber(extra),
            "🗑️ Mapping removed.",
          ),
        );
        return true;
      }
      default:
        return false;
    }
  }

  if (action.startsWith("rm")) {
    switch (action) {
      case "rmpage": {
        await showPanel(interaction, () =>
          renderRoleMenusPanel(interaction, services, pageNumber(target)),
        );
        return true;
      }
      case "rmpick": {
        if (!interaction.isStringSelectMenu()) return true;
        const groupId = interaction.values[0];
        if (!groupId) return true;
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            groupId,
            pageNumber(target),
          ),
        );
        return true;
      }
      case "rm": {
        await showPanel(interaction, () =>
          renderRoleMenuGroup(interaction, services, target, pageNumber(extra)),
        );
        return true;
      }
      case "rmcreate": {
        if (!interaction.isButton()) return true;
        await interaction.showModal(roleMenuCreateModal(pageNumber(target)));
        return true;
      }
      case "rmedit": {
        if (!interaction.isButton()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        await interaction.showModal(
          roleMenuEditModal(group, pageNumber(extra)),
        );
        return true;
      }
      case "rmaddrole": {
        if (!interaction.isRoleSelectMenu()) return true;
        const roleId = interaction.values[0];
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group || !roleId) return true;
        const role =
          interaction.guild?.roles.cache.get(roleId) ??
          (await interaction.guild?.roles.fetch(roleId).catch(() => null));
        const me = interaction.guild?.members.me;
        const problem = !role
          ? "That role no longer exists."
          : role.id === guildId
            ? "The @everyone role cannot be a menu option."
            : role.managed
              ? "Integration-managed roles cannot be assigned by role menus."
              : !me?.permissions.has(PermissionFlagsBits.ManageRoles)
                ? "I need the **Manage Roles** permission to assign menu roles."
                : role.position >= (me?.roles.highest.position ?? 0)
                  ? "That role is above or equal to my highest role."
                  : group.options.some((option) => option.roleId === role.id)
                    ? "That role is already an option in this group."
                    : null;
        if (problem || !role) {
          await showPanel(interaction, () =>
            renderRoleMenuGroup(
              interaction,
              services,
              group.id,
              pageNumber(extra),
              `❌ ${problem ?? "That role is unavailable."}`,
            ),
          );
          return true;
        }
        const config = await getRoleMenusConfig(
          servicesForModule(services),
          guildId,
        );
        if (group.options.length >= config.maxOptionsPerGroup) {
          await showPanel(interaction, () =>
            renderRoleMenuGroup(
              interaction,
              services,
              group.id,
              pageNumber(extra),
              `❌ This server allows at most ${config.maxOptionsPerGroup} options per group.`,
            ),
          );
          return true;
        }
        const position =
          group.options.reduce(
            (highest, option) => Math.max(highest, option.position),
            -1,
          ) + 1;
        await services.helpers.roleMenus.createOption({
          groupId: group.id,
          roleId: role.id,
          label: role.name.slice(0, 80),
          emoji: null,
          description: null,
          position,
        });
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            group.id,
            pageNumber(extra),
            `✅ Added <@&${role.id}>.`,
          ),
        );
        return true;
      }
      case "rmdelopt": {
        if (!interaction.isStringSelectMenu()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        const removed = new Set(interaction.values);
        const options = group.options.filter((option) =>
          removed.has(option.id),
        );
        for (const option of options) {
          await services.helpers.roleMenus.deleteOption(option.id);
          await services.helpers.roleMenus
            .deleteTempRolesForRole(group.guildId, option.roleId)
            .catch(() => undefined);
        }
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            group.id,
            pageNumber(extra),
            `🗑️ Removed ${options.length} option${options.length === 1 ? "" : "s"}.`,
          ),
        );
        return true;
      }
      case "rmtoggle": {
        if (!interaction.isButton()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        const field = extra === "requireOne" ? "requireOne" : "autoToggle";
        const current =
          field === "requireOne" ? group.requireOne : group.autoToggle;
        await services.helpers.roleMenus.updateGroup(group.id, {
          [field]: !current,
        });
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            group.id,
            pageNumber(extra2),
            `✅ ${field === "requireOne" ? "Require one" : "Auto toggle"} ${!current ? "enabled" : "disabled"}.`,
          ),
        );
        return true;
      }
      case "rmrefresh": {
        if (!interaction.isButton()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        const messages = await services.helpers.roleMenus.listGroupMessages(
          group.id,
        );
        let refreshed = 0;
        let deleted = 0;
        let skipped = 0;
        for (const message of messages) {
          const outcome = await refreshRoleMenuMessage(
            servicesForModule(services),
            interaction.guild!,
            group,
            group.options,
            message,
          );
          if (outcome === "refreshed") refreshed += 1;
          else if (outcome === "deleted") deleted += 1;
          else skipped += 1;
        }
        await showPanel(interaction, () =>
          renderRoleMenuGroup(
            interaction,
            services,
            group.id,
            pageNumber(extra),
            `🔄 Refreshed ${refreshed}; deleted ${deleted}; skipped ${skipped}.`,
          ),
        );
        return true;
      }
      case "rmdelete": {
        if (!interaction.isButton()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        await showPanel(interaction, () =>
          renderRoleMenuDelete(interaction, services, group, pageNumber(extra)),
        );
        return true;
      }
      case "rmdelconfirm": {
        if (!interaction.isButton()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        const deleted = await deleteGroup(services, group);
        await showPanel(interaction, () =>
          renderRoleMenusPanel(
            interaction,
            services,
            pageNumber(extra),
            `🗑️ Deleted **${group.name}** and ${deleted} posted menu${deleted === 1 ? "" : "s"}.`,
          ),
        );
        return true;
      }
      case "rmpost": {
        if (!interaction.isButton()) return true;
        await showPanel(interaction, () =>
          renderRoleMenuPost(interaction, services, target, pageNumber(extra)),
        );
        return true;
      }
      case "rmpoststyle": {
        if (!interaction.isStringSelectMenu()) return true;
        const style = interaction.values[0] as RoleMenuStyle;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        if (!group) return true;
        await showPanel(interaction, () =>
          postCard(
            interaction,
            services,
            ["Role Menus", group.name, "Post"],
            [
              row(
                createChannelSelectMenu({
                  customId: `lumi:rmpostchan:${group.id}:${style}:${pageNumber(extra)}`,
                  placeholder: "Choose the channel to post in…",
                  channelTypes: [
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement,
                  ],
                  minValues: 1,
                  maxValues: 1,
                }),
              ),
              row(
                backButton(
                  `lumi:rmpost:${group.id}:${pageNumber(extra2)}`,
                  "Cancel",
                ),
              ),
            ],
            "📣 Post Role Menu",
            [
              `**Style**\n${styleLabel(style)}`,
              `**Options**\n${group.options.length}`,
              "-# Choose a channel to publish the menu.",
            ],
          ),
        );
        return true;
      }
      case "rmpostchan": {
        if (!interaction.isChannelSelectMenu()) return true;
        const group = await services.helpers.roleMenus.findGroupById(
          guildId,
          target,
        );
        const channelId = interaction.values[0];
        const style = extra as RoleMenuStyle;
        if (!group || !channelId) return true;
        const channel = await guildChannel(
          interaction.guild ?? null,
          channelId,
        );
        if (!channel?.isSendable()) {
          await showPanel(interaction, () =>
            renderRoleMenuPost(
              interaction,
              services,
              group.id,
              pageNumber(extra2),
              "❌ I cannot send messages in that channel.",
            ),
          );
          return true;
        }
        if (
          group.options.length > MaxReactionOptions &&
          style === "reactions"
        ) {
          await showPanel(interaction, () =>
            renderRoleMenuPost(
              interaction,
              services,
              group.id,
              pageNumber(extra2),
              `❌ Reaction menus support at most ${MaxReactionOptions} options.`,
            ),
          );
          return true;
        }
        const card = await postGroup(
          interaction,
          services,
          group,
          style,
          channel,
        );
        await showPanel(interaction, async () => card);
        return true;
      }
      case "rmmodalcreate":
      case "rmmodaledit":
        return false;
      default:
        return false;
    }
  }

  return false;
}
