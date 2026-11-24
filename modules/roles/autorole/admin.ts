import {
  type CardReply,
  createActionButton,
  createRoleSelectMenu,
  createUserSelectMenu,
  ephemeralCard,
  makeErrorCard,
  row,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  type AutoroleConfig,
  getAutoroleConfig,
  saveAutoroleConfig,
} from "./config.js";
import {
  evaluateAutoroleCandidate,
  selectRolesToAssign,
} from "./logic.js";
import {
  cancelPendingAutoroles,
  countPendingAutoroles,
  enqueueAutorole,
  processPendingAutoroles,
} from "./store.js";
import { fetchMember } from "../../shared/roles.js";
import type { BotServices } from "../../../src/core/contracts.js";
import { servicesForModule } from "../../../src/core/modules.js";
import {
  backButton,
  type HubInteraction,
  type ModuleActionParams,
  type PanelInteraction,
  showPanel,
} from "../../../src/admin/panel/common.js";
import {
  AutoroleModuleName,
  booleanLabel,
  MaxRoleOptions,
  moduleBackButton,
  pageNumber,
  postCard,
  replyOrUpdate,
  roleMentions,
} from "../../../src/admin/panel/roles/shared.js";

export { AutoroleModuleName } from "./config.js";

export async function renderAutorolePanel(
  interaction: HubInteraction,
  services: BotServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const module = servicesForModule(services);
  const config = await getAutoroleConfig(module, guildId);
  const pending = await countPendingAutoroles(module, guildId);

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createRoleSelectMenu({
        customId: `lumi:aroles:${page}`,
        placeholder: "Choose the roles assigned on join…",
        minValues: 0,
        maxValues: MaxRoleOptions,
      }),
    ),
    row(
      createActionButton({
        customId: `lumi:ardelay:${page}`,
        label: "Delay",
        emoji: "⏱️",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:arrun:${page}`,
        label: "Run Queue",
        emoji: "▶️",
        style: ButtonStyle.Success,
      }),
      createActionButton({
        customId: `lumi:arpause:${page}`,
        label: config.paused ? "Resume" : "Pause",
        emoji: config.paused ? "▶️" : "⏸️",
        style: config.paused ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:arcancel:${page}`,
        label: "Cancel Pending",
        emoji: "🗑️",
        style: ButtonStyle.Danger,
      }),
      createActionButton({
        customId: `lumi:arfilters:${page}`,
        label: "Filters",
        emoji: "🧮",
        style: ButtonStyle.Secondary,
      }),
    ),
    row(
      createUserSelectMenu({
        customId: `lumi:arqueue:${page}`,
        placeholder: "Queue a member now…",
        minValues: 1,
        maxValues: 1,
      }),
    ),
    row(moduleBackButton(AutoroleModuleName, page)),
  ];

  return postCard(
    interaction,
    services,
    ["Autorole"],
    rows,
    `${services.moduleLoader.getModule(AutoroleModuleName)?.manifest.emoji ?? "🚪"} Autorole`,
    [
      ...(notice ? [`**${notice}**`] : []),
      `**Status**\n${config.enabled ? "Enabled" : "Disabled"}${config.paused ? " · Paused" : ""}`,
      `**Roles**\n${roleMentions(config.roleIds)}`,
      `**Delay**\n${config.delaySeconds}s`,
      `**Minimum account age**\n${config.minAccountAgeHours}h`,
      `**Required roles**\n${roleMentions(config.requiredRoleIds)}`,
      `**Ignored roles**\n${roleMentions(config.ignoredRoleIds)}`,
      `**Ignore bots**\n${config.ignoreBots ? "Yes" : "No"} · **Only on join** ${config.onlyOnJoin ? "Yes" : "No"}`,
      `**Pending queue**\n${pending}`,
      "-# Use the role picker to replace autoroles, or Filters for eligibility settings.",
    ],
  );
}

export async function renderAutoroleFilters(
  interaction: HubInteraction,
  services: BotServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const config = await getAutoroleConfig(servicesForModule(services), guildId);
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createRoleSelectMenu({
        customId: `lumi:arrequired:${page}`,
        placeholder: "Required roles (member needs at least one)…",
        minValues: 0,
        maxValues: MaxRoleOptions,
      }),
    ),
    row(
      createRoleSelectMenu({
        customId: `lumi:arignored:${page}`,
        placeholder: "Roles that make a member ineligible…",
        minValues: 0,
        maxValues: MaxRoleOptions,
      }),
    ),
    row(
      createActionButton({
        customId: `lumi:arage:${page}`,
        label: "Min Age",
        emoji: "🕒",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:arignorebots:${page}`,
        label: `Ignore Bots: ${booleanLabel(config.ignoreBots)}`,
        emoji: "🤖",
        style: config.ignoreBots ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `lumi:aronlyjoin:${page}`,
        label: `Only On Join: ${booleanLabel(config.onlyOnJoin)}`,
        emoji: "🚪",
        style: config.onlyOnJoin ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
    ),
    row(backButton(`lumi:autorole:${page}`, "Back")),
  ];

  return postCard(
    interaction,
    services,
    ["Autorole", "Filters"],
    rows,
    `${services.moduleLoader.getModule(AutoroleModuleName)?.manifest.emoji ?? "🚪"} Autorole Filters`,
    [
      ...(notice ? [`**${notice}**`] : []),
      `**Minimum account age**\n${config.minAccountAgeHours}h`,
      `**Required roles**\n${roleMentions(config.requiredRoleIds)}`,
      `**Ignored roles**\n${roleMentions(config.ignoredRoleIds)}`,
      `**Ignore bots**\n${config.ignoreBots ? "Yes" : "No"} · **Only on join** ${config.onlyOnJoin ? "Yes" : "No"}`,
      "-# Required roles need at least one match; ignored roles make a member ineligible.",
    ],
  );
}

export function autoroleAgeModal(
  config: AutoroleConfig,
  page: number,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:armodalage:${page}`)
    .setTitle("Set minimum account age")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("hours")
          .setLabel("Minimum account age in hours (0 = off)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setValue(String(config.minAccountAgeHours)),
      ),
    );
}

export function autoroleDelayModal(
  config: AutoroleConfig,
  page: number,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:armodaldelay:${page}`)
    .setTitle("Set autorole delay")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("seconds")
          .setLabel("Delay in seconds (0 = immediate)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(7)
          .setValue(String(config.delaySeconds)),
      ),
    );
}

export async function renderAutoroleNotice(
  interaction: PanelInteraction,
  services: BotServices,
  message: string,
): Promise<void> {
  await showPanel(interaction, () =>
    renderAutorolePanel(interaction, services, 0, message),
  );
}

export async function handleAutoroleAction(
  interaction: PanelInteraction,
  services: BotServices,
  params: ModuleActionParams,
): Promise<boolean> {
  const { guildId, action, target } = params;
  if (action === "autorole") {
    await showPanel(interaction, () =>
      renderAutorolePanel(interaction, services, pageNumber(target)),
    );
    return true;
  }
  if (!action.startsWith("ar")) return false;

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

export async function handleAutoroleModal(
  interaction: ModalSubmitInteraction,
  services: BotServices,
  guildId: string,
  parts: string[],
): Promise<boolean> {
  const action = parts[1];
  if (action === "armodaldelay") {
    const config = await getAutoroleConfig(
      servicesForModule(services),
      guildId,
    );
    const raw = interaction.fields.getTextInputValue("seconds").trim();
    const seconds = Number(raw);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 604800) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Delay",
            "Enter a whole number from 0 to 604800 seconds.",
          ),
        ),
      );
      return true;
    }
    config.delaySeconds = seconds;
    await saveAutoroleConfig(servicesForModule(services), guildId, config);
    await replyOrUpdate(
      interaction,
      await renderAutorolePanel(
        interaction,
        services,
        pageNumber(parts[2]),
        `⏱️ Delay set to ${seconds}s.`,
      ),
    );
    return true;
  }

  if (action === "armodalage") {
    const config = await getAutoroleConfig(
      servicesForModule(services),
      guildId,
    );
    const raw = interaction.fields.getTextInputValue("hours").trim();
    const hours = Number(raw);
    if (!Number.isInteger(hours) || hours < 0 || hours > 8760) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Account Age",
            "Enter a whole number from 0 to 8760 hours.",
          ),
        ),
      );
      return true;
    }
    config.minAccountAgeHours = hours;
    await saveAutoroleConfig(servicesForModule(services), guildId, config);
    await replyOrUpdate(
      interaction,
      await renderAutoroleFilters(
        interaction,
        services,
        pageNumber(parts[2]),
        `🕒 Minimum account age set to ${hours}h.`,
      ),
    );
    return true;
  }

  return false;
}
