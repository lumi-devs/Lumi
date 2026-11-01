import { requireGuildId } from "@lumi/foundation";
import type { CommandDefinition, ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeListCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import {
  ChannelType,
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  accessContextFromInteraction,
  isTicketAdmin,
  isTicketStaff,
  ticketAccess,
} from "./access.js";
import {
  getTicketsConfig,
  isTicketsModuleEnabled,
  parseIdList,
  parseQuestionsInput,
  type TicketQuestion,
  type TicketsConfig,
} from "./config.js";
import { Priorities, PriorityEmoji, TicketsModuleName } from "./constants.js";
import { escapeHtml } from "./html.js";
import { panelCard, ticketInfoCard } from "./panel.js";
import {
  findTicketByChannel,
  findTicketById,
  listCategories,
  listTicketNotes,
  prismaOf,
  questionsOf,
  type TicketCategoryRecord,
  type TicketPanelRecord,
  type TicketRecord,
} from "./repository.js";
import { closeTicket, resolveThread } from "./ticket-service.js";
import { canCloseTicket, isPriority, validateFeedback } from "./validation.js";

const CategoryNameLimit = 80;

async function replyCard(
  interaction: ChatInputCommandInteraction,
  card: ReturnType<typeof makeInfoCard>,
): Promise<void> {
  const payload =
    interaction.deferred || interaction.replied ? card : ephemeralCard(card);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => undefined);
  } else {
    await interaction.reply(payload).catch(() => undefined);
  }
}

async function replyError(
  interaction: ChatInputCommandInteraction,
  title: string,
  body: string,
): Promise<void> {
  await replyCard(interaction, makeErrorCard(title, body));
}

async function guildIdOf(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) {
    await replyError(
      interaction,
      "Server Only",
      "Ticket commands can only be used inside a server.",
    );
    return null;
  }
  return guildId;
}

async function ensureModule(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<boolean> {
  if (isTicketsModuleEnabled(services, guildId)) return true;
  await replyError(
    interaction,
    "Tickets Disabled",
    `The ${TicketsModuleName} module is disabled on this server.`,
  );
  return false;
}

async function requireAdmin(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<boolean> {
  const context = accessContextFromInteraction(interaction);
  if (!context || !(await isTicketAdmin(services, context))) {
    await replyError(
      interaction,
      "Staff Only",
      "You need the **tickets.admin** permit, **Manage Server**, or **Administrator** to configure tickets.",
    );
    return false;
  }
  return true;
}

async function requireStaff(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  config: TicketsConfig,
): Promise<boolean> {
  const context = accessContextFromInteraction(interaction);
  if (!context || !(await isTicketStaff(services, context, config))) {
    await replyError(
      interaction,
      "Staff Only",
      "You need a ticket staff role or the **tickets.manage** permit to do that.",
    );
    return false;
  }
  return true;
}

async function currentTicket(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<TicketRecord | null> {
  const ticket = await findTicketByChannel(services, interaction.channelId);
  if (!ticket) {
    await replyError(
      interaction,
      "Not A Ticket",
      "Run this command inside a ticket thread.",
    );
    return null;
  }
  return ticket;
}

interface TicketCommandContext {
  ticket: TicketRecord;
  config: TicketsConfig;
  access: { isStaff: boolean; isAdmin: boolean };
}

async function requireTicketAccess(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  options: { staffOnly?: boolean; openOnly?: boolean } = {},
): Promise<TicketCommandContext | null> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) {
    await replyError(
      interaction,
      "Server Only",
      "Ticket commands can only be used inside a server.",
    );
    return null;
  }
  const ticket = await currentTicket(interaction, services);
  if (!ticket || ticket.guildId !== guildId) return null;
  const config = await getTicketsConfig(services, guildId);
  const context = accessContextFromInteraction(interaction);
  if (!context) return null;
  const access = await ticketAccess(
    services,
    context,
    config,
    ticket.category?.staffRoleIds ?? [],
  );
  if (options.staffOnly && !access.isStaff) {
    await replyError(
      interaction,
      "Staff Only",
      "You need a ticket staff role or the **tickets.manage** permit to do that.",
    );
    return null;
  }
  if (options.openOnly && ticket.status !== "open") {
    await replyError(
      interaction,
      "Ticket Closed",
      "This ticket is already closed and can no longer be changed.",
    );
    return null;
  }
  return { ticket, config, access };
}

function formatCategories(
  categories: readonly TicketCategoryRecord[],
): string[] {
  return categories.map((category) => {
    const roles = category.staffRoleIds.length
      ? category.staffRoleIds.map((id) => `<@&${id}>`).join(", ")
      : "none";
    const pings = category.pingRoleIds.length
      ? category.pingRoleIds.map((id) => `<@&${id}>`).join(", ")
      : "none";
    return `${category.emoji ? `${category.emoji} ` : ""}**${category.name}**${category.enabled ? "" : " *(disabled)*"} — ${category.description ?? "No description"}\n-# Staff: ${roles} · Ping: ${pings} · Priority: ${category.defaultPriority} · Questions: ${questionsOf(category).length} · Template: \`${category.namingTemplate}\``;
  });
}

async function setupPanel(
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

  const prisma = prismaOf(services);
  const title = (
    interaction.options.getString("title") ?? "Support Tickets"
  ).slice(0, 100);
  const description = (
    interaction.options.getString("description") ??
    "Need help? Choose a category below to open a private support thread."
  ).slice(0, 2000);
  let panel: TicketPanelRecord;
  try {
    panel = await prisma.ticketPanel.create({
      data: {
        guildId,
        channelId: channel.id,
        title,
        description,
        categoryIds: selected.map((category) => category.id),
      },
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
    await prisma.ticketPanel
      .delete({ where: { id: panel.id } })
      .catch(() => undefined);
    await replyError(
      interaction,
      "Panel Not Posted",
      "The panel could not be posted in that channel.",
    );
    return;
  }
  await prisma.ticketPanel
    .update({ where: { id: panel.id }, data: { messageId: message.id } })
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

async function categoryAdd(
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
  const prisma = prismaOf(services);
  const position = (await prisma.ticketCategory
    .count({ where: { guildId } })
    .catch(() => 0)) as number;
  try {
    const category = await prisma.ticketCategory.create({
      data: {
        guildId,
        name,
        emoji: interaction.options.getString("emoji")?.slice(0, 64) ?? null,
        description:
          interaction.options.getString("description")?.slice(0, 500) ?? null,
        staffRoleIds: parseIdList(interaction.options.getString("staff_roles")),
        pingRoleIds: parseIdList(interaction.options.getString("ping_roles")),
        questions,
        namingTemplate:
          interaction.options.getString("naming_template")?.slice(0, 100) ??
          "ticket-{user}",
        defaultPriority: isPriority(defaultPriority)
          ? defaultPriority
          : "normal",
        position,
      },
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

function clearable(value: string | null): string | null | undefined {
  if (value === null) return undefined;
  return value === "-" ? null : value;
}

async function categoryEdit(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId || !(await requireAdmin(interaction, services))) return;
  const prisma = prismaOf(services);
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

  const data: Record<string, unknown> = {};
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
  const namingTemplate = interaction.options.getString("naming_template");
  if (namingTemplate !== null)
    data.namingTemplate = namingTemplate.slice(0, 100);
  const defaultPriority = interaction.options.getString("default_priority");
  if (isPriority(defaultPriority)) data.defaultPriority = defaultPriority;
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
    const updated = await prisma.ticketCategory.update({
      where: { id: current.id },
      data,
    });
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
  const prisma = prismaOf(services);
  try {
    return (await prisma.ticketCategory.findUnique({
      where: { guildId_name: { guildId, name } },
    })) as TicketCategoryRecord | null;
  } catch {
    return null;
  }
}

async function categoryRemove(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId || !(await requireAdmin(interaction, services))) return;
  const prisma = prismaOf(services);
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

  const panels = (await prisma.ticketPanel
    .findMany({ where: { guildId, categoryIds: { has: category.id } } })
    .catch(() => [])) as Array<{ id: string; categoryIds: string[] }>;
  await prisma.ticketCategory.delete({ where: { id: category.id } });
  for (const panel of panels) {
    await prisma.ticketPanel
      .update({
        where: { id: panel.id },
        data: {
          categoryIds: panel.categoryIds.filter((id) => id !== category.id),
        },
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

async function categoryList(
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

async function closeCurrentTicket(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const context = await requireTicketAccess(interaction, services);
  if (!context) return;
  const validation = canCloseTicket(
    context.ticket,
    interaction.user.id,
    context.access.isStaff,
  );
  if (!validation.ok) {
    await replyError(interaction, "Cannot Close Ticket", validation.reason);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = await closeTicket(
      services,
      interaction.guild,
      context.ticket,
      interaction.user.id,
      interaction.options.getString("reason"),
    );
    await replyCard(
      interaction,
      makeSuccessCard("Ticket Closed", [
        `Ticket \`${result.ticket.id}\` is now closed.`,
        `**Transcript** ${result.transcriptUrl}`,
        "The thread has been locked and archived.",
      ]),
    );
  } catch (error) {
    services.observability?.logger?.error?.("tickets close failed", {
      guildId: context.ticket.guildId,
      ticketId: context.ticket.id,
      error,
    });
    await replyError(
      interaction,
      "Close Failed",
      "The ticket could not be fully closed. Check the transcript channel permissions and try again.",
    );
  }
}

async function claimTicket(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  unclaim = false,
): Promise<void> {
  const context = await requireTicketAccess(interaction, services, {
    staffOnly: true,
    openOnly: true,
  });
  if (!context) return;
  const current = context.ticket.claimedBy;
  if (unclaim) {
    if (!current) {
      await replyCard(
        interaction,
        makeInfoCard("Not Claimed", "This ticket is not currently claimed."),
      );
      return;
    }
    if (current !== interaction.user.id && !context.access.isAdmin) {
      await replyError(
        interaction,
        "Claimed By Someone Else",
        `Only <@${current}> or an admin can unclaim this ticket.`,
      );
      return;
    }
    await prismaOf(services).ticket.update({
      where: { id: context.ticket.id },
      data: { claimedBy: null },
    });
    await replyCard(
      interaction,
      makeSuccessCard("Ticket Unclaimed", "This ticket is now unclaimed."),
    );
    return;
  }

  if (current === interaction.user.id) {
    await replyCard(
      interaction,
      makeInfoCard("Already Claimed", "You already claimed this ticket."),
    );
    return;
  }
  if (current && !context.access.isAdmin) {
    await replyError(
      interaction,
      "Already Claimed",
      `This ticket is already claimed by <@${current}>.`,
    );
    return;
  }
  await prismaOf(services).ticket.update({
    where: { id: context.ticket.id },
    data: { claimedBy: interaction.user.id },
  });
  await replyCard(
    interaction,
    makeSuccessCard("Ticket Claimed", `You are now handling this ticket.`),
  );
}

async function setPriority(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const context = await requireTicketAccess(interaction, services, {
    staffOnly: true,
    openOnly: true,
  });
  if (!context) return;
  const value = interaction.options.getString("level", true);
  if (!isPriority(value)) {
    await replyError(
      interaction,
      "Invalid Priority",
      "Choose low, normal, high, or urgent.",
    );
    return;
  }
  await prismaOf(services).ticket.update({
    where: { id: context.ticket.id },
    data: { priority: value },
  });
  await replyCard(
    interaction,
    makeSuccessCard(
      "Priority Updated",
      `${PriorityEmoji[value]} Priority set to **${value}**.`,
    ),
  );
}

async function addNote(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const context = await requireTicketAccess(interaction, services, {
    staffOnly: true,
  });
  if (!context) return;
  const content = interaction.options.getString("content", true).trim();
  if (!content) {
    await replyError(
      interaction,
      "Empty Note",
      "Write a note before saving it.",
    );
    return;
  }
  await prismaOf(services).ticketNote.create({
    data: {
      ticketId: context.ticket.id,
      authorId: interaction.user.id,
      content: content.slice(0, 2000),
    },
  });
  await replyCard(
    interaction,
    makeSuccessCard(
      "Note Saved",
      "The note is included in the ticket transcript.",
    ),
  );
}

async function changeMember(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  add: boolean,
): Promise<void> {
  const context = await requireTicketAccess(interaction, services, {
    staffOnly: true,
    openOnly: true,
  });
  if (!context) return;
  const target = interaction.options.getUser("user", true);
  if (!add && target.id === context.ticket.userId) {
    await replyError(
      interaction,
      "Cannot Remove Opener",
      "The ticket opener cannot be removed from their own ticket.",
    );
    return;
  }
  const guild = interaction.guild;
  const thread = await resolveThread(services, guild, context.ticket.channelId);
  if (!thread) {
    await replyError(
      interaction,
      "Thread Missing",
      "The ticket thread no longer exists.",
    );
    return;
  }
  if (add) {
    await thread.members.add(target.id).catch(() => undefined);
  } else {
    await thread.members.remove(target.id).catch(() => undefined);
  }
  await replyCard(
    interaction,
    makeSuccessCard(
      add ? "Member Added" : "Member Removed",
      `<@${target.id}> ${add ? "can now see" : "can no longer see"} this ticket.`,
    ),
  );
}

async function blacklistCommand(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  action: string,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const config = await getTicketsConfig(services, guildId);
  if (!(await requireStaff(interaction, services, config))) return;
  const prisma = prismaOf(services);

  if (action === "add") {
    const user = interaction.options.getUser("user", true);
    const reason =
      interaction.options.getString("reason")?.slice(0, 500) ?? null;
    await prisma.ticketBlacklist.upsert({
      where: { guildId_userId: { guildId, userId: user.id } },
      update: { reason, createdBy: interaction.user.id },
      create: {
        guildId,
        userId: user.id,
        reason,
        createdBy: interaction.user.id,
      },
    });
    await replyCard(
      interaction,
      makeSuccessCard(
        "Member Blacklisted",
        `<@${user.id}> can no longer open tickets.`,
      ),
    );
    return;
  }

  if (action === "remove") {
    const user = interaction.options.getUser("user", true);
    const deleted = await prisma.ticketBlacklist
      .delete({
        where: { guildId_userId: { guildId, userId: user.id } },
      })
      .catch(() => null);
    if (!deleted) {
      await replyCard(
        interaction,
        makeInfoCard(
          "Not Blacklisted",
          `<@${user.id}> is not on the ticket blacklist.`,
        ),
      );
      return;
    }
    await replyCard(
      interaction,
      makeSuccessCard(
        "Blacklist Removed",
        `<@${user.id}> can open tickets again.`,
      ),
    );
    return;
  }

  const rows = (await prisma.ticketBlacklist
    .findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: 25,
    })
    .catch(() => [])) as Array<{
    userId: string;
    reason: string | null;
    createdBy: string;
    createdAt: Date | string;
  }>;
  if (rows.length === 0) {
    await replyCard(
      interaction,
      makeInfoCard("Ticket Blacklist", "No members are blacklisted."),
    );
    return;
  }
  await replyCard(
    interaction,
    makeListCard(
      "Ticket Blacklist",
      rows.map(
        (row) =>
          `<@${row.userId}> — ${row.reason ?? "No reason"} · added by <@${row.createdBy}>`,
      ),
    ),
  );
}

async function tagCommand(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  action: string,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const config = await getTicketsConfig(services, guildId);
  if (!(await requireStaff(interaction, services, config))) return;
  const prisma = prismaOf(services);

  if (action === "add") {
    const name = interaction.options.getString("name", true).trim();
    const content = interaction.options.getString("content", true).trim();
    if (!name || !content) {
      await replyError(
        interaction,
        "Invalid Tag",
        "A tag needs a name and content.",
      );
      return;
    }
    try {
      await prisma.ticketTag.create({
        data: {
          guildId,
          name: name.slice(0, 50),
          content: content.slice(0, 2000),
          createdBy: interaction.user.id,
        },
      });
      await replyCard(
        interaction,
        makeSuccessCard("Tag Created", `Tag **${name}** is ready to use.`),
      );
    } catch {
      await replyError(
        interaction,
        "Tag Not Created",
        "A tag with that name may already exist.",
      );
    }
    return;
  }

  if (action === "remove") {
    const name = interaction.options.getString("name", true).trim();
    const deleted = await prisma.ticketTag
      .delete({ where: { guildId_name: { guildId, name } } })
      .catch(() => null);
    if (!deleted) {
      await replyCard(
        interaction,
        makeInfoCard("Tag Missing", `No tag named **${name}** exists.`),
      );
      return;
    }
    await replyCard(
      interaction,
      makeSuccessCard("Tag Removed", `Tag **${name}** has been removed.`),
    );
    return;
  }

  if (action === "list") {
    const tags = (await prisma.ticketTag
      .findMany({ where: { guildId }, orderBy: { name: "asc" }, take: 25 })
      .catch(() => [])) as Array<{
      name: string;
      content: string;
      createdBy: string;
    }>;
    if (tags.length === 0) {
      await replyCard(
        interaction,
        makeInfoCard("Ticket Tags", "No canned replies are configured."),
      );
      return;
    }
    await replyCard(
      interaction,
      makeListCard(
        "Ticket Tags",
        tags.map((tag) => `**${tag.name}** — ${tag.content.slice(0, 120)}`),
      ),
    );
    return;
  }

  const context = await requireTicketAccess(interaction, services, {
    staffOnly: true,
    openOnly: true,
  });
  if (!context) return;
  const name = interaction.options.getString("name", true).trim();
  const tag = (await prisma.ticketTag
    .findUnique({ where: { guildId_name: { guildId, name } } })
    .catch(() => null)) as { content: string } | null;
  if (!tag) {
    await replyError(
      interaction,
      "Tag Missing",
      `No tag named **${name}** exists.`,
    );
    return;
  }
  const thread = await resolveThread(
    services,
    interaction.guild,
    context.ticket.channelId,
  );
  if (!thread) {
    await replyError(
      interaction,
      "Thread Missing",
      "The ticket thread no longer exists.",
    );
    return;
  }
  const card = makeInfoCard(`📎 ${name}`, tag.content, {
    subtitle: "Canned reply",
    footer: `Sent by ${interaction.user.tag}`,
  });
  const message = await thread.send(cardCreateOptions(card)).catch(() => null);
  await prisma.ticketMessage
    .create({
      data: {
        ticketId: context.ticket.id,
        messageId: message?.id ?? null,
        authorId: interaction.user.id,
        authorName: interaction.user.tag,
        content: escapeHtml(tag.content),
        attachments: [],
      },
    })
    .catch(() => undefined);
  await replyCard(
    interaction,
    makeSuccessCard("Tag Sent", `Posted **${name}** in the ticket thread.`),
  );
}

async function feedbackCommand(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const ticketId = interaction.options.getString("ticket");
  const ticket = ticketId
    ? await findTicketById(services, ticketId)
    : await findTicketByChannel(services, interaction.channelId);
  if (!ticket || ticket.guildId !== guildId) {
    await replyError(
      interaction,
      "Ticket Missing",
      "That ticket could not be found.",
    );
    return;
  }
  const config = await getTicketsConfig(services, guildId);
  const rating = interaction.options.getInteger("rating", true);
  const validation = validateFeedback(
    ticket,
    interaction.user.id,
    rating,
    config.feedbackEnabled,
  );
  if (!validation.ok) {
    await replyError(interaction, "Feedback Not Accepted", validation.reason);
    return;
  }
  const comment =
    interaction.options.getString("comment")?.slice(0, 1000) ?? null;
  await prismaOf(services).ticket.update({
    where: { id: ticket.id },
    data: { feedback: rating, feedbackComment: comment },
  });
  await replyCard(
    interaction,
    makeSuccessCard(
      "Feedback Recorded",
      `Thank you! Your rating of **${rating}/5** has been saved.`,
    ),
  );
}

async function infoCommand(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const ticketId = interaction.options.getString("ticket");
  const ticket = ticketId
    ? await findTicketById(services, ticketId)
    : await findTicketByChannel(services, interaction.channelId);
  if (!ticket || ticket.guildId !== guildId) {
    await replyError(
      interaction,
      "Ticket Missing",
      "Provide a ticket ID or run this inside the ticket thread.",
    );
    return;
  }
  const config = await getTicketsConfig(services, guildId);
  const context = accessContextFromInteraction(interaction);
  if (!context) return;
  const access = await ticketAccess(
    services,
    context,
    config,
    ticket.category?.staffRoleIds ?? [],
  );
  if (ticket.userId !== interaction.user.id && !access.isStaff) {
    await replyError(
      interaction,
      "Not Allowed",
      "Only the ticket opener or ticket staff can view this ticket.",
    );
    return;
  }
  const notes = await listTicketNotes(services, ticket.id);
  await replyCard(interaction, ticketInfoCard(ticket, notes.length));
}

async function listCommand(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const config = await getTicketsConfig(services, guildId);
  if (!(await requireStaff(interaction, services, config))) return;
  const status = interaction.options.getString("status") ?? "open";
  const prisma = prismaOf(services);
  const rows = (await prisma.ticket
    .findMany({
      where: {
        guildId,
        ...(status === "all" ? {} : { status }),
      },
      include: { category: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    })
    .catch(() => [])) as TicketRecord[];
  if (rows.length === 0) {
    await replyCard(
      interaction,
      makeInfoCard(
        "Tickets",
        `No ${status === "all" ? "" : status} tickets found.`,
      ),
    );
    return;
  }
  await replyCard(
    interaction,
    makeListCard(
      `🎫 ${status === "all" ? "All" : status[0]?.toUpperCase() + status.slice(1)} Tickets`,
      rows.map((ticket) => {
        const priority =
          PriorityEmoji[ticket.priority as keyof typeof PriorityEmoji] ?? "🔵";
        return `\`${ticket.id.slice(0, 8)}\` ${priority} **${ticket.category?.name ?? "No category"}** — <@${ticket.userId}>${ticket.claimedBy ? ` · claimed by <@${ticket.claimedBy}>` : ""} · <#${ticket.channelId}>`;
      }),
      { footer: `${rows.length} shown` },
    ),
  );
}

const Command = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Open and manage private support tickets")
  .addSubcommandGroup((group) =>
    group
      .setName("setup")
      .setDescription("Post and configure ticket panels")
      .addSubcommand((sub) =>
        sub
          .setName("panel")
          .setDescription("Post a ticket panel in a text channel")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Channel to post the panel in")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("title")
              .setDescription("Panel title")
              .setMaxLength(100)
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription("Panel description")
              .setMaxLength(2000)
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("categories")
              .setDescription(
                "Comma-separated category names (default: all enabled)",
              )
              .setMaxLength(500)
              .setRequired(false),
          ),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("category")
      .setDescription("Manage ticket categories")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Create a ticket category")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Category name")
              .setRequired(true)
              .setMaxLength(CategoryNameLimit),
          )
          .addStringOption((option) =>
            option
              .setName("emoji")
              .setDescription("Category emoji")
              .setRequired(false)
              .setMaxLength(64),
          )
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription("Category description")
              .setRequired(false)
              .setMaxLength(500),
          )
          .addStringOption((option) =>
            option
              .setName("staff_roles")
              .setDescription("Comma-separated staff role IDs or mentions")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("ping_roles")
              .setDescription("Comma-separated ping role IDs or mentions")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("naming_template")
              .setDescription(
                "Thread name template: {user}, {username}, {id}, {category}, {number}",
              )
              .setRequired(false)
              .setMaxLength(100),
          )
          .addStringOption((option) =>
            option
              .setName("default_priority")
              .setDescription("Default ticket priority")
              .setRequired(false)
              .addChoices(
                ...Priorities.map((priority) => ({
                  name: priority,
                  value: priority,
                })),
              ),
          )
          .addStringOption((option) =>
            option
              .setName("questions")
              .setDescription("JSON array of up to 5 modal questions")
              .setRequired(false)
              .setMaxLength(4000),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("edit")
          .setDescription("Edit a ticket category")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Current category name")
              .setRequired(true)
              .setMaxLength(CategoryNameLimit),
          )
          .addStringOption((option) =>
            option
              .setName("new_name")
              .setDescription("New category name")
              .setRequired(false)
              .setMaxLength(CategoryNameLimit),
          )
          .addStringOption((option) =>
            option
              .setName("emoji")
              .setDescription("Category emoji, or - to clear")
              .setRequired(false)
              .setMaxLength(64),
          )
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription("Category description, or - to clear")
              .setRequired(false)
              .setMaxLength(500),
          )
          .addStringOption((option) =>
            option
              .setName("staff_roles")
              .setDescription("Comma-separated staff role IDs, or - to clear")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("ping_roles")
              .setDescription("Comma-separated ping role IDs, or - to clear")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("naming_template")
              .setDescription("Thread name template")
              .setRequired(false)
              .setMaxLength(100),
          )
          .addStringOption((option) =>
            option
              .setName("default_priority")
              .setDescription("Default ticket priority")
              .setRequired(false)
              .addChoices(
                ...Priorities.map((priority) => ({
                  name: priority,
                  value: priority,
                })),
              ),
          )
          .addStringOption((option) =>
            option
              .setName("questions")
              .setDescription("JSON array of up to 5 modal questions")
              .setRequired(false)
              .setMaxLength(4000),
          )
          .addBooleanOption((option) =>
            option
              .setName("enabled")
              .setDescription("Whether the category is available")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Delete a ticket category")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Category name")
              .setRequired(true)
              .setMaxLength(CategoryNameLimit),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List ticket categories"),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("close")
      .setDescription("Close this ticket and save a transcript")
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Close reason")
          .setRequired(false)
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("claim").setDescription("Claim this ticket"),
  )
  .addSubcommand((sub) =>
    sub.setName("unclaim").setDescription("Release this ticket"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("priority")
      .setDescription("Set this ticket's priority")
      .addStringOption((option) =>
        option
          .setName("level")
          .setDescription("Priority level")
          .setRequired(true)
          .addChoices(
            ...Priorities.map((priority) => ({
              name: priority,
              value: priority,
            })),
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("note")
      .setDescription("Add an internal staff note")
      .addStringOption((option) =>
        option
          .setName("content")
          .setDescription("Note content")
          .setRequired(true)
          .setMaxLength(2000),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a member to this ticket thread")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Member to add")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a member from this ticket thread")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Member to remove")
          .setRequired(true),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("blacklist")
      .setDescription("Manage members who cannot open tickets")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Blacklist a member")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("Member to blacklist")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("reason")
              .setDescription("Reason")
              .setRequired(false)
              .setMaxLength(500),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a member from the blacklist")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("Member to unblacklist")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List blacklisted members"),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("tag")
      .setDescription("Manage canned replies")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Create a canned reply")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Tag name")
              .setRequired(true)
              .setMaxLength(50),
          )
          .addStringOption((option) =>
            option
              .setName("content")
              .setDescription("Reply content")
              .setRequired(true)
              .setMaxLength(2000),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Delete a canned reply")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Tag name")
              .setRequired(true)
              .setMaxLength(50),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List canned replies"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("use")
          .setDescription("Post a canned reply in this ticket")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Tag name")
              .setRequired(true)
              .setMaxLength(50),
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("feedback")
      .setDescription("Rate a closed ticket")
      .addIntegerOption((option) =>
        option
          .setName("rating")
          .setDescription("Rating from 1 to 5")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(5),
      )
      .addStringOption((option) =>
        option
          .setName("comment")
          .setDescription("Optional comment")
          .setRequired(false)
          .setMaxLength(1000),
      )
      .addStringOption((option) =>
        option
          .setName("ticket")
          .setDescription("Ticket ID (defaults to this thread's ticket)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("Show ticket details")
      .addStringOption((option) =>
        option
          .setName("ticket")
          .setDescription("Ticket ID (defaults to this thread's ticket)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List tickets (staff only)")
      .addStringOption((option) =>
        option
          .setName("status")
          .setDescription("Which tickets to list")
          .setRequired(false)
          .addChoices(
            { name: "open", value: "open" },
            { name: "closed", value: "closed" },
            { name: "all", value: "all" },
          ),
      ),
  );

async function execute(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = await guildIdOf(interaction);
  if (!guildId) return;
  if (!(await ensureModule(interaction, services, guildId))) return;

  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);

  if (group === "setup" && sub === "panel") {
    await setupPanel(interaction, services);
    return;
  }
  if (group === "category") {
    if (sub === "add") return categoryAdd(interaction, services);
    if (sub === "edit") return categoryEdit(interaction, services);
    if (sub === "remove") return categoryRemove(interaction, services);
    if (sub === "list") return categoryList(interaction, services);
  }
  if (group === "blacklist" && sub) {
    return blacklistCommand(interaction, services, sub);
  }
  if (group === "tag" && sub) {
    return tagCommand(interaction, services, sub);
  }

  switch (sub) {
    case "close":
      return closeCurrentTicket(interaction, services);
    case "claim":
      return claimTicket(interaction, services, false);
    case "unclaim":
      return claimTicket(interaction, services, true);
    case "priority":
      return setPriority(interaction, services);
    case "note":
      return addNote(interaction, services);
    case "add":
      return changeMember(interaction, services, true);
    case "remove":
      return changeMember(interaction, services, false);
    case "feedback":
      return feedbackCommand(interaction, services);
    case "info":
      return infoCommand(interaction, services);
    case "list":
      return listCommand(interaction, services);
    default:
      await replyError(
        interaction,
        "Unknown Command",
        "That ticket action is not available.",
      );
  }
}

export const ticketCommand: CommandDefinition = {
  data: Command,
  requiredPermit: "tickets.manage",
  async execute(interaction, services) {
    await execute(interaction, services);
  },
};
