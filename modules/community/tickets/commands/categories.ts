import { requireGuildId } from "@lumi/foundation";
import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  makeInfoCard,
  makeListCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import { ChannelType, type ChatInputCommandInteraction } from "discord.js";
import {
  parseIdList,
  parseQuestionsInput,
  type TicketQuestion,
} from "../config.js";
import { panelCard } from "../panel.js";
import {
  listCategories,
  type TicketCategoryRecord,
  type TicketPanelRecord,
} from "../repository.js";
import { isPriority } from "../validation.js";
import {
  CategoryNameLimit,
  clearable,
  formatCategories,
  replyCard,
  replyError,
  requireAdmin,
} from "./shared.js";

export async function setupPanel(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  const guild = interaction.guild;
  if (!guildId || !guild) return;
  if (!(await requireAdmin(interaction, services))) return;

  const configuredChannel = interaction.options.getChannel("channel");
  const channelId = configuredChannel?.id ?? interaction.channelId;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement) ||
    !("threads" in channel)
  ) {
    await replyError(
      interaction,
      "Invalid Channel",
      "Choose a text channel that can host private threads.",
    );
    return;
  }

  const rawCategories = interaction.options.getString("categories");
  const allCategories = await listCategories(services, guildId, {
    enabledOnly: true,
  });
  const names = rawCategories
    ? rawCategories
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const selected = names.length
    ? allCategories.filter((category) =>
        names.includes(category.name.toLowerCase()),
      )
    : allCategories;
  if (selected.length === 0) {
    await replyError(
      interaction,
      "No Categories",
      "Create at least one enabled category with `/ticket category add` first.",
    );
    return;
  }

  const title = (
    interaction.options.getString("title") ?? "Support Tickets"
  ).slice(0, 100);
  const description = (
    interaction.options.getString("description") ??
    "Need help? Choose a category below to open a private support thread."
  ).slice(0, 2000);
  let panel: TicketPanelRecord;
  try {
    panel = await services.helpers.tickets.createPanel({
      guildId,
      channelId: channel.id,
      title,
      description,
      categoryIds: selected.map((category) => category.id),
    });
  } catch (error) {
    services.observability?.logger?.warn?.("tickets panel create failed", {
      guildId,
      error,
    });
    await replyError(
      interaction,
      "Panel Not Saved",
      "The panel could not be saved. Try again.",
    );
    return;
  }

  const card = panelCard(panel, selected);
  const message = await channel.send(cardCreateOptions(card)).catch(() => null);
  if (!message) {
    await services.helpers.tickets.deletePanel(panel.id).catch(() => undefined);
    await replyError(
      interaction,
      "Panel Not Posted",
      "The panel could not be posted in that channel.",
    );
    return;
  }
  await services.helpers.tickets
    .updatePanel(panel.id, { messageId: message.id })
    .catch(() => undefined);

  await replyCard(
    interaction,
    makeSuccessCard("Ticket Panel Posted", [
      `Posted in <#${channel.id}>.`,
      `**Categories** ${selected.length}`,
      `**Panel ID** \`${panel.id}\``,
    ]),
  );
}

export async function categoryAdd(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId || !(await requireAdmin(interaction, services))) return;
  const name = interaction.options.getString("name", true).trim();
  if (!name || name.length > CategoryNameLimit) {
    await replyError(
      interaction,
      "Invalid Name",
      `Category names must be 1-${CategoryNameLimit} characters.`,
    );
    return;
  }
  const rawQuestions = interaction.options.getString("questions");
  let questions: TicketQuestion[];
  try {
    questions = rawQuestions ? parseQuestionsInput(rawQuestions) : [];
  } catch (error) {
    await replyError(
      interaction,
      "Invalid Questions",
      error instanceof Error ? error.message : String(error),
    );
    return;
  }
  const defaultPriority = interaction.options.getString("default_priority");
  const position = await services.helpers.tickets
    .countCategories(guildId)
    .catch(() => 0);
  try {
    const category = await services.helpers.tickets.createCategory({
      guildId,
      name,
      emoji: interaction.options.getString("emoji")?.slice(0, 64) ?? null,
      description:
        interaction.options.getString("description")?.slice(0, 500) ?? null,
      staffRoleIds: parseIdList(interaction.options.getString("staff_roles")),
      pingRoleIds: parseIdList(interaction.options.getString("ping_roles")),
      requiredRoleIds: parseIdList(
        interaction.options.getString("required_roles"),
      ),
      questions,
      namingTemplate:
        interaction.options.getString("naming_template")?.slice(0, 100) ??
        "ticket-{user}",
      defaultPriority: isPriority(defaultPriority) ? defaultPriority : "normal",
      openingMessage:
        interaction.options.getString("opening_message")?.slice(0, 2000) ?? null,
      cooldownSeconds:
        interaction.options.getInteger("cooldown_seconds") ?? 0,
      memberLimit: interaction.options.getInteger("member_limit") ?? 0,
      totalLimit: interaction.options.getInteger("total_limit") ?? 0,
      claimingEnabled:
        interaction.options.getBoolean("claiming_enabled") ?? true,
      feedbackEnabled:
        interaction.options.getBoolean("feedback_enabled") ?? true,
      position,
    });
    await replyCard(
      interaction,
      makeSuccessCard("Category Created", [
        `**${category.emoji ? `${category.emoji} ` : ""}${category.name}** is ready.`,
        `**Category ID** \`${category.id}\``,
        `**Questions** ${questions.length}`,
      ]),
    );
  } catch (error) {
    services.observability?.logger?.warn?.("tickets category create failed", {
      guildId,
      error,
    });
    await replyError(
      interaction,
      "Category Not Created",
      "A category with that name may already exist.",
    );
  }
}

export async function categoryEdit(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId || !(await requireAdmin(interaction, services))) return;
  const current = await findCategoryByName(
    services,
    guildId,
    interaction.options.getString("name", true),
  );
  if (!current) {
    await replyError(
      interaction,
      "Category Missing",
      "No category has that name.",
    );
    return;
  }

  const data: Parameters<
    ModuleServices["helpers"]["tickets"]["updateCategory"]
  >[1] = {};
  const newName = interaction.options.getString("new_name");
  if (newName) data.name = newName.trim().slice(0, CategoryNameLimit);
  const emoji = clearable(interaction.options.getString("emoji"));
  if (emoji !== undefined) data.emoji = emoji?.slice(0, 64) ?? null;
  const description = clearable(interaction.options.getString("description"));
  if (description !== undefined) {
    data.description = description?.slice(0, 500) ?? null;
  }
  const staffRoles = interaction.options.getString("staff_roles");
  if (staffRoles !== null) data.staffRoleIds = parseIdList(staffRoles);
  const pingRoles = interaction.options.getString("ping_roles");
  if (pingRoles !== null) data.pingRoleIds = parseIdList(pingRoles);
  const requiredRoles = interaction.options.getString("required_roles");
  if (requiredRoles !== null)
    data.requiredRoleIds = parseIdList(requiredRoles);
  const namingTemplate = interaction.options.getString("naming_template");
  if (namingTemplate !== null)
    data.namingTemplate = namingTemplate.slice(0, 100);
  const defaultPriority = interaction.options.getString("default_priority");
  if (isPriority(defaultPriority)) data.defaultPriority = defaultPriority;
  const openingMessage = clearable(
    interaction.options.getString("opening_message"),
  );
  if (openingMessage !== undefined) {
    data.openingMessage = openingMessage?.slice(0, 2000) ?? null;
  }
  const cooldownSeconds = interaction.options.getInteger("cooldown_seconds");
  if (cooldownSeconds !== null) data.cooldownSeconds = cooldownSeconds;
  const memberLimit = interaction.options.getInteger("member_limit");
  if (memberLimit !== null) data.memberLimit = memberLimit;
  const totalLimit = interaction.options.getInteger("total_limit");
  if (totalLimit !== null) data.totalLimit = totalLimit;
  const claimingEnabled = interaction.options.getBoolean("claiming_enabled");
  if (claimingEnabled !== null) data.claimingEnabled = claimingEnabled;
  const feedbackEnabled = interaction.options.getBoolean("feedback_enabled");
  if (feedbackEnabled !== null) data.feedbackEnabled = feedbackEnabled;
  const enabled = interaction.options.getBoolean("enabled");
  if (enabled !== null) data.enabled = enabled;
  const rawQuestions = interaction.options.getString("questions");
  if (rawQuestions !== null) {
    try {
      data.questions = parseQuestionsInput(rawQuestions);
    } catch (error) {
      await replyError(
        interaction,
        "Invalid Questions",
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
  }

  if (Object.keys(data).length === 0) {
    await replyCard(
      interaction,
      makeWarningCard(
        "Nothing To Change",
        "Provide at least one field to edit.",
      ),
    );
    return;
  }

  try {
    const updated = await services.helpers.tickets.updateCategory(
      current.id,
      data,
    );
    await replyCard(
      interaction,
      makeSuccessCard("Category Updated", [
        `**${updated.name}** has been updated.`,
        `**Fields changed** ${Object.keys(data).join(", ")}`,
      ]),
    );
  } catch (error) {
    services.observability?.logger?.warn?.("tickets category update failed", {
      guildId,
      error,
    });
    await replyError(
      interaction,
      "Category Not Updated",
      "The category could not be saved. Check for duplicate names.",
    );
  }
}

async function findCategoryByName(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<TicketCategoryRecord | null> {
  try {
    return (await services.helpers.tickets.findCategoryByName(
      guildId,
      name,
    )) as TicketCategoryRecord | null;
  } catch {
    return null;
  }
}

export async function categoryRemove(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId || !(await requireAdmin(interaction, services))) return;
  const category = await findCategoryByName(
    services,
    guildId,
    interaction.options.getString("name", true),
  );
  if (!category) {
    await replyError(
      interaction,
      "Category Missing",
      "No category has that name.",
    );
    return;
  }

  const panels = (await services.helpers.tickets
    .listPanelsByCategory(guildId, category.id)
    .catch(() => [])) as Array<{ id: string; categoryIds: string[] }>;
  await services.helpers.tickets.deleteCategory(category.id);
  for (const panel of panels) {
    await services.helpers.tickets
      .updatePanel(panel.id, {
        categoryIds: panel.categoryIds.filter((id) => id !== category.id),
      })
      .catch(() => undefined);
  }

  await replyCard(
    interaction,
    makeSuccessCard("Category Removed", [
      `**${category.name}** has been removed.`,
      `Existing tickets keep their history but are no longer linked to this category.`,
    ]),
  );
}

export async function categoryList(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId || !(await requireAdmin(interaction, services))) return;
  const categories = await listCategories(services, guildId);
  if (categories.length === 0) {
    await replyCard(
      interaction,
      makeInfoCard(
        "Ticket Categories",
        "No categories are configured yet. Use `/ticket category add` to create one.",
      ),
    );
    return;
  }
  await replyCard(
    interaction,
    makeListCard("Ticket Categories", formatCategories(categories), {
      footer: `${categories.length} categories`,
    }),
  );
}
