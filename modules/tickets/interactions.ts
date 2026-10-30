import { isSnowflake, requireGuildId } from "@lumi/foundation";
import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  ChannelType,
  type GuildMember,
  type Interaction,
  MessageFlags,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  type ThreadChannel,
} from "discord.js";
import {
  getTicketsConfig,
  isTicketsModuleEnabled,
  normalizeQuestions,
} from "./config.js";
import { TicketIds, TicketsModuleName } from "./constants.js";
import { escapeHtml } from "./html.js";
import { ticketThreadName } from "./naming.js";
import { ticketOpenedCard } from "./panel.js";
import {
  countGuildTickets,
  countOpenTickets,
  findCategory,
  findPanel,
  findTicketById,
  isBlacklisted,
  listCategories,
  prismaOf,
  questionsOf,
  type TicketCategoryRecord,
  type TicketPanelRecord,
  type TicketRecord,
} from "./repository.js";
import { isPriority, validateFeedback } from "./validation.js";

type ComponentInteraction = ButtonInteraction | AnySelectMenuInteraction;

const DefaultQuestion = {
  label: "Briefly describe your issue",
  placeholder: "A short summary helps staff route your ticket",
  required: true,
  style: "short" as const,
  maxLength: 200,
};

function openQuestions(category: TicketCategoryRecord) {
  const configured = questionsOf(category);
  return configured.length > 0 ? configured : [DefaultQuestion];
}

async function replyError(
  interaction: ComponentInteraction | ModalSubmitInteraction,
  title: string,
  body: string,
): Promise<void> {
  const card = ephemeralCard(makeErrorCard(title, body));
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(card).catch(() => undefined);
  } else {
    await interaction.reply(card).catch(() => undefined);
  }
}

async function replySuccess(
  interaction: ComponentInteraction | ModalSubmitInteraction,
  title: string,
  body: string | string[],
): Promise<void> {
  const card = ephemeralCard(makeSuccessCard(title, body));
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(card).catch(() => undefined);
  } else {
    await interaction.reply(card).catch(() => undefined);
  }
}

async function openTicketModal(
  interaction: ComponentInteraction,
  services: ModuleServices,
  panelId: string,
  categoryId: string,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) {
    await replyError(
      interaction,
      "Server Only",
      "Tickets only work in a server.",
    );
    return;
  }

  const panel = await findPanel(services, panelId);
  if (!panel || panel.guildId !== guildId) {
    await replyError(
      interaction,
      "Panel Missing",
      "This ticket panel no longer exists.",
    );
    return;
  }
  const category = await findCategory(services, guildId, categoryId);
  if (
    !category ||
    !category.enabled ||
    !panel.categoryIds.includes(category.id)
  ) {
    await replyError(
      interaction,
      "Category Unavailable",
      "That ticket category is not available on this panel.",
    );
    return;
  }

  const config = await getTicketsConfig(services, guildId);
  if (await isBlacklisted(services, guildId, interaction.user.id)) {
    await replyError(
      interaction,
      "Ticket Restricted",
      "You are blacklisted from opening tickets in this server.",
    );
    return;
  }
  const openCount = await countOpenTickets(
    services,
    guildId,
    interaction.user.id,
  );
  if (openCount >= config.maxOpenPerUser) {
    await replyError(
      interaction,
      "Open Ticket Limit",
      `You already have ${openCount} open ticket(s). The limit is ${config.maxOpenPerUser}.`,
    );
    return;
  }

  const questions = openQuestions(category);
  const modal = new ModalBuilder()
    .setCustomId(TicketIds.modalOpen(panel.id, category.id))
    .setTitle(`Open ${category.name}`.slice(0, 45));
  const rows = questions.slice(0, 5).map((question, index) =>
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(`q${index}`)
        .setLabel(question.label.slice(0, 45))
        .setStyle(
          question.style === "long"
            ? TextInputStyle.Paragraph
            : TextInputStyle.Short,
        )
        .setRequired(question.required)
        .setMaxLength(
          question.maxLength ?? (question.style === "long" ? 1024 : 200),
        )
        .setPlaceholder(question.placeholder ?? ""),
    ),
  );
  modal.addComponents(...rows);
  await interaction.showModal(modal).catch(() => undefined);
}

async function createTicketFromModal(
  interaction: ModalSubmitInteraction,
  services: ModuleServices,
  panelId: string,
  categoryId: string,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = requireGuildId(interaction.guildId);
  const guild = interaction.guild;
  if (!guildId || !guild) {
    await replyError(
      interaction,
      "Server Only",
      "Tickets only work in a server.",
    );
    return;
  }

  const panel = await findPanel(services, panelId);
  if (!panel || panel.guildId !== guildId) {
    await replyError(
      interaction,
      "Panel Missing",
      "This ticket panel no longer exists.",
    );
    return;
  }
  const category = await findCategory(services, guildId, categoryId);
  if (
    !category ||
    !category.enabled ||
    !panel.categoryIds.includes(category.id)
  ) {
    await replyError(
      interaction,
      "Category Unavailable",
      "That ticket category is not available on this panel.",
    );
    return;
  }

  const config = await getTicketsConfig(services, guildId);
  if (await isBlacklisted(services, guildId, interaction.user.id)) {
    await replyError(
      interaction,
      "Ticket Restricted",
      "You are blacklisted from opening tickets in this server.",
    );
    return;
  }
  const openCount = await countOpenTickets(
    services,
    guildId,
    interaction.user.id,
  );
  if (openCount >= config.maxOpenPerUser) {
    await replyError(
      interaction,
      "Open Ticket Limit",
      `You already have ${openCount} open ticket(s). The limit is ${config.maxOpenPerUser}.`,
    );
    return;
  }

  const questions = openQuestions(category);
  const answers = questions.slice(0, 5).map((_question, index) => {
    try {
      return interaction.fields.getTextInputValue(`q${index}`).trim();
    } catch {
      return "";
    }
  });
  const subject = answers[0]?.slice(0, 200) || null;

  const parent = await guild.channels.fetch(panel.channelId).catch(() => null);
  if (
    !parent ||
    !parent.isTextBased() ||
    !("threads" in parent) ||
    parent.isThread()
  ) {
    await replyError(
      interaction,
      "Panel Channel Missing",
      "The panel's channel cannot host private ticket threads anymore.",
    );
    return;
  }

  const member = interaction.member as GuildMember | null;
  const displayName =
    member?.displayName ??
    interaction.user.globalName ??
    interaction.user.username;
  const number = (await countGuildTickets(services, guildId)) + 1;
  const name = ticketThreadName(category.namingTemplate, {
    user: displayName,
    username: interaction.user.username,
    userId: interaction.user.id,
    category: category.name,
    number,
  });

  let thread: ThreadChannel;
  try {
    thread = await (parent.threads as any).create({
      name,
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: 10080,
      reason: `Ticket opened by ${interaction.user.tag}`,
    });
  } catch (error) {
    services.observability?.logger?.warn?.("tickets thread create failed", {
      guildId,
      channelId: panel.channelId,
      error,
    });
    await replyError(
      interaction,
      "Could Not Open Ticket",
      "Discord refused to create a private thread. Check that private threads are available in this server.",
    );
    return;
  }

  const prisma = prismaOf(services);
  let ticket: TicketRecord;
  try {
    ticket = await prisma.ticket.create({
      data: {
        guildId,
        categoryId: category.id,
        channelId: thread.id,
        userId: interaction.user.id,
        status: "open",
        priority: isPriority(category.defaultPriority)
          ? category.defaultPriority
          : "normal",
        subject,
      },
      include: { category: true },
    });
  } catch (error) {
    services.observability?.logger?.warn?.("tickets row create failed", {
      guildId,
      error,
    });
    await thread.delete("Ticket setup failed").catch(() => undefined);
    await replyError(
      interaction,
      "Could Not Open Ticket",
      "The ticket could not be saved. Please try again.",
    );
    return;
  }

  await thread.members.add(interaction.user.id).catch(() => undefined);

  const summary = [
    `Ticket opened by ${interaction.user.tag} in ${category.name}`,
    ...questions
      .slice(0, 5)
      .map(
        (question, index) =>
          `${question.label}: ${answers[index] || "No answer provided"}`,
      ),
  ].join("\n");
  await prisma.ticketMessage
    .create({
      data: {
        ticketId: ticket.id,
        authorId: interaction.user.id,
        authorName: displayName,
        content: escapeHtml(summary),
        attachments: [],
      },
    })
    .catch(() => undefined);

  const pingRoleIds = config.mentionStaffOnOpen
    ? [...new Set([...category.pingRoleIds, ...category.staffRoleIds])]
    : [];
  const card = ticketOpenedCard(
    ticket,
    category,
    answers,
    interaction.user.id,
    pingRoleIds,
  );
  await thread
    .send({
      ...cardCreateOptions(card),
      allowedMentions:
        pingRoleIds.length > 0 ? { roles: pingRoleIds } : { parse: [] },
    })
    .catch(() => undefined);

  await replySuccess(interaction, "Ticket Opened", [
    `Your private ticket thread is ready: <#${thread.id}>`,
    "Staff have been notified. You can also run `/ticket close` inside the thread when you are done.",
  ]);
}

async function handleFeedback(
  interaction: ButtonInteraction,
  services: ModuleServices,
  ticketId: string,
  rawRating: string,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const rating = Number.parseInt(rawRating, 10);
  const ticket = await findTicketById(services, ticketId);
  if (!ticket || ticket.guildId !== guildId) {
    await replyError(
      interaction,
      "Ticket Missing",
      "That ticket could not be found.",
    );
    return;
  }
  const config = await getTicketsConfig(services, guildId);
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

  const prisma = prismaOf(services);
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      feedback: rating,
    },
  });
  await replySuccess(
    interaction,
    "Feedback Recorded",
    `Thank you! Your rating of **${rating}/5** has been saved.`,
  );
}

export async function handleTicketInteraction(
  interaction: Interaction,
  services: ModuleServices,
): Promise<void> {
  if (
    !interaction.isButton() &&
    !interaction.isAnySelectMenu() &&
    !interaction.isModalSubmit()
  ) {
    return;
  }
  if (!interaction.customId.startsWith("tickets:")) return;
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;

  if (!isTicketsModuleEnabled(services, guildId)) {
    if (!interaction.isModalSubmit()) {
      await interaction
        .reply(
          ephemeralCard(
            makeWarningCard(
              "Tickets Disabled",
              `The ${TicketsModuleName} module is disabled on this server.`,
            ),
          ),
        )
        .catch(() => undefined);
    }
    return;
  }

  const parts = interaction.customId.split(":");

  if (interaction.isButton() && parts[1] === "feedback") {
    const [, , ticketId, rating] = parts;
    if (ticketId && rating) {
      await handleFeedback(interaction, services, ticketId, rating);
    }
    return;
  }

  if (parts[1] === "panel" && interaction.isAnySelectMenu()) {
    const [, , panelId] = parts;
    const categoryId = interaction.values[0];
    if (panelId && categoryId && isSnowflake(categoryId)) {
      await openTicketModal(interaction, services, panelId, categoryId);
    }
    return;
  }

  if (parts[1] === "panel" && interaction.isButton()) {
    const [, , panelId] = parts;
    if (!panelId) return;
    const panel: TicketPanelRecord | null = await findPanel(services, panelId);
    if (!panel || panel.guildId !== guildId) {
      await replyError(
        interaction,
        "Panel Missing",
        "This ticket panel no longer exists.",
      );
      return;
    }
    const categories = await listCategories(services, guildId, {
      enabledOnly: true,
      ids: panel.categoryIds,
    });
    const categoryId = categories[0]?.id;
    if (!categoryId) {
      await replyError(
        interaction,
        "No Categories",
        "This panel has no available ticket categories configured.",
      );
      return;
    }
    await openTicketModal(interaction, services, panel.id, categoryId);
    return;
  }

  if (
    interaction.isModalSubmit() &&
    parts[1] === "modal" &&
    parts[2] === "open"
  ) {
    const [, , , panelId, categoryId] = parts;
    if (panelId && categoryId) {
      await createTicketFromModal(interaction, services, panelId, categoryId);
    }
  }
}

export function modalQuestionCount(category: TicketCategoryRecord): number {
  return Math.min(normalizeQuestions(category.questions).length || 1, 5);
}
