import { requireGuildId } from "@lumi/foundation";
import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  cardMessage,
  createActionButton,
  createStringSelectMenu,
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  row,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  type ButtonInteraction,
  ButtonStyle,
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
import { applyAutoTags } from "./autotags.js";
import {
  getTicketsConfig,
  isTicketsModuleEnabled,
  type TicketMenuQuestion,
  type TicketQuestion,
  type TicketsConfig,
  type TicketTextQuestion,
} from "./config.js";
import { TicketIds } from "./constants.js";
import { escapeHtml } from "./html.js";
import { ticketThreadName } from "./naming.js";
import { ticketOpenedCard } from "./panel.js";
import { feedbackEnabledFor, validateTicketOpen } from "./policy.js";
import {
  countGuildTickets,
  findCategory,
  findPanel,
  findTicketById,
  questionsOf,
  type TicketCategoryRecord,
  type TicketPanelRecord,
} from "./repository.js";
import {
  createTicketOpenSession,
  deleteTicketOpenSession,
  getTicketOpenSession,
  type TicketOpenSession,
  updateTicketOpenSession,
} from "./sessions.js";
import { isPriority, validateFeedback } from "./validation.js";

const DefaultQuestion: TicketQuestion = {
  type: "text",
  label: "How can we help?",
  placeholder: "Describe your issue or request.",
  required: true,
  style: "long",
  maxLength: 1000,
};

function isMenuQuestion(
  question: TicketQuestion,
): question is TicketMenuQuestion {
  return question.type === "menu";
}

function openQuestions(category: TicketCategoryRecord): TicketQuestion[] {
  const questions = questionsOf(category);
  return questions.length > 0 ? questions : [DefaultQuestion];
}

function nextMenuIndex(
  questions: TicketQuestion[],
  answers: (string | null)[],
  from: number,
): number | null {
  for (let i = from; i < questions.length; i++) {
    if (isMenuQuestion(questions[i]!) && answers[i] === null) return i;
  }
  return null;
}

function textEntries(
  questions: TicketQuestion[],
): { index: number; question: TicketTextQuestion }[] {
  return questions.flatMap((question, index) =>
    isMenuQuestion(question) ? [] : [{ index, question }],
  );
}

function memberRoleIds(interaction: Interaction): string[] {
  const member = interaction.member;
  if (!member || !("roles" in member)) return [];
  const roles = member.roles;
  return Array.isArray(roles) ? roles : [...roles.cache.keys()];
}

async function replyError(
  interaction: Interaction,
  title: string,
  body: string,
): Promise<void> {
  const payload = ephemeralCard(makeErrorCard(title, body));
  if (interaction.isRepliable()) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(cardMessage(payload)).catch(() => undefined);
    } else {
      await interaction.reply(payload).catch(() => undefined);
    }
  }
}

async function replySuccess(
  interaction: Interaction,
  title: string,
  body: string,
): Promise<void> {
  const payload = ephemeralCard(makeSuccessCard(title, body));
  if (interaction.isRepliable()) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(cardMessage(payload)).catch(() => undefined);
    } else {
      await interaction.reply(payload).catch(() => undefined);
    }
  }
}

function buildTextModal(
  questions: { index: number; question: TicketTextQuestion }[],
  customId: string,
  title: string,
): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const entry of questions.slice(0, 5)) {
    const question = entry.question;
    const input = new TextInputBuilder()
      .setCustomId(`t${entry.index}`)
      .setLabel(question.label.slice(0, 45))
      .setStyle(
        question.style === "long"
          ? TextInputStyle.Paragraph
          : TextInputStyle.Short,
      )
      .setRequired(question.required);
    if (question.placeholder) input.setPlaceholder(question.placeholder);
    if (question.maxLength) input.setMaxLength(question.maxLength);
    modal.addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        input,
      ),
    );
  }
  return modal;
}

async function showTextModal(
  interaction: Interaction,
  questions: { index: number; question: TicketTextQuestion }[],
  customId: string,
): Promise<void> {
  if (!interaction.isModalSubmit() && "showModal" in interaction) {
    await interaction.showModal(
      buildTextModal(questions, customId, "Open Ticket"),
    );
  }
}

async function showMenuStep(
  interaction: Interaction,
  services: ModuleServices,
  session: TicketOpenSession,
  questions: TicketQuestion[],
  from: number,
): Promise<void> {
  const index = nextMenuIndex(questions, session.answers, from);
  if (index === null) {
    await afterMenuQuestions(interaction, services, session, questions);
    return;
  }

  const question = questions[index];
  if (!question || !isMenuQuestion(question)) return;

  const menu = createStringSelectMenu({
    customId: TicketIds.openMenu(session.token, index),
    placeholder: question.placeholder ?? question.label,
    options: question.options.map((option, optionIndex) => ({
      label: option.label,
      value: String(optionIndex),
      ...(option.description ? { description: option.description } : {}),
    })),
    minValues: question.required ? question.minValues : 0,
    maxValues: question.maxValues,
  });

  const actionRows = [row(menu)];
  if (!question.required) {
    actionRows.push(
      row(
        createActionButton({
          customId: TicketIds.openSkip(session.token, index),
          label: "Skip",
          style: ButtonStyle.Secondary,
        }),
      ),
    );
  }

  const card = ephemeralCard(
    makeInfoCard(
      `Question ${index + 1} of ${questions.length}`,
      [
        question.label,
        question.required
          ? "This question is required."
          : "This question is optional — use Skip to leave it blank.",
      ],
      {
        footer: "This prompt expires in 15 minutes",
        actionRows,
        separatorAboveActionRows: true,
      },
    ),
  );

  if (
    interaction.isRepliable() &&
    (interaction.deferred || interaction.replied)
  ) {
    if ("update" in interaction) {
      await interaction
        .update(cardCreateOptions(card) as never)
        .catch(() => undefined);
    }
  } else if (interaction.isRepliable()) {
    await interaction.reply(card).catch(() => undefined);
  }
}

async function afterMenuQuestions(
  interaction: Interaction,
  services: ModuleServices,
  session: TicketOpenSession,
  questions: TicketQuestion[],
): Promise<void> {
  const entries = textEntries(questions);
  if (entries.length > 0) {
    await showTextModal(
      interaction,
      entries,
      TicketIds.openModal(session.token),
    );
    return;
  }
  await finishSession(interaction, services, session, questions);
}

async function finishSession(
  interaction: Interaction,
  services: ModuleServices,
  session: TicketOpenSession,
  questions: TicketQuestion[],
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) {
    await replyError(
      interaction,
      "Guild Only",
      "Tickets can only be opened in a server.",
    );
    return;
  }

  const policy = await validateTicketOpen(services, {
    guildId,
    userId: interaction.user.id,
    roleIds: memberRoleIds(interaction),
    panelId: session.panelId,
    categoryId: session.categoryId,
  });
  if (!policy.ok) {
    await deleteTicketOpenSession(services, session.token);
    await replyError(interaction, policy.title, policy.body);
    return;
  }

  const answers = questions.map((_, index) => session.answers[index] ?? "");
  await deleteTicketOpenSession(services, session.token);
  await createTicketFromAnswers(
    interaction,
    services,
    policy.panel,
    policy.category,
    policy.config,
    answers,
    questions,
  );
}

async function showTicketOpenMenu(
  interaction: Interaction,
  services: ModuleServices,
  panel: TicketPanelRecord,
  category: TicketCategoryRecord,
): Promise<void> {
  const questions = openQuestions(category);
  if (!questions.some(isMenuQuestion)) {
    const entries = textEntries(questions);
    await showTextModal(
      interaction,
      entries,
      TicketIds.modalOpen(panel.id, category.id),
    );
    return;
  }

  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const session = await createTicketOpenSession(services, {
    guildId,
    userId: interaction.user.id,
    panelId: panel.id,
    categoryId: category.id,
  });
  session.answers = Array.from({ length: questions.length }, () => null);
  await updateTicketOpenSession(services, session);
  await showMenuStep(interaction, services, session, questions, 0);
}

async function createTicketFromAnswers(
  interaction: Interaction,
  services: ModuleServices,
  panel: TicketPanelRecord,
  category: TicketCategoryRecord,
  config: TicketsConfig,
  answers: string[],
  questions: TicketQuestion[],
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  const guild = interaction.guild;
  if (!guildId || !guild) {
    await replyError(
      interaction,
      "Guild Only",
      "Tickets can only be opened in a server.",
    );
    return;
  }

  if (
    interaction.isRepliable() &&
    !interaction.deferred &&
    !interaction.replied
  ) {
    if (interaction.isModalSubmit()) {
      await interaction
        .deferReply({ flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
    } else if ("deferUpdate" in interaction) {
      await interaction.deferUpdate().catch(() => undefined);
    }
  }

  const parent = await guild.channels.fetch(panel.channelId).catch(() => null);
  if (!parent || !("threads" in parent) || !parent.isTextBased()) {
    await replyError(
      interaction,
      "Panel Unavailable",
      "The ticket panel channel is no longer available.",
    );
    return;
  }

  const member = interaction.member as GuildMember | null;
  const number = (await countGuildTickets(services, guildId)) + 1;
  const subject = answers[0]?.trim().slice(0, 120) || null;
  const threadName = ticketThreadName(category.namingTemplate, {
    number,
    user:
      (interaction.member as GuildMember | null)?.displayName ??
      interaction.user.displayName,
    username: interaction.user.username,
    userId: interaction.user.id,
    category: category.name,
  });

  let thread: ThreadChannel;
  try {
    thread = await parent.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: `Ticket opened by ${interaction.user.tag}`,
    } as never);
  } catch {
    await replyError(
      interaction,
      "Ticket Creation Failed",
      "I could not create a private thread here. Check my **Create Private Threads** permission.",
    );
    return;
  }

  const ticket = await services.helpers.tickets.createTicket({
    guildId,
    channelId: thread.id,
    userId: interaction.user.id,
    categoryId: category.id,
    subject,
    priority: isPriority(category.defaultPriority)
      ? category.defaultPriority
      : "normal",
  });

  await thread.members.add(interaction.user.id).catch(() => undefined);
  if (member) {
    await thread.members.add(member.id).catch(() => undefined);
  }

  const answerLines = questions.flatMap((question, index) => {
    const answer = answers[index]?.trim();
    if (!answer) return [];
    return [`**${escapeHtml(question.label)}**`, answer];
  });

  const summary =
    answerLines.length > 0
      ? answerLines.join("\n")
      : "No answers were provided when this ticket was opened.";
  await services.helpers.tickets
    .createMessage({
      ticketId: ticket.id,
      authorId: interaction.user.id,
      authorName: interaction.user.username,
      content: summary,
      attachments: [],
    })
    .catch(() => undefined);

  const pingRoles = category.pingRoleIds;
  const openingCard = ticketOpenedCard(
    ticket,
    category,
    answers,
    questions,
    interaction.user.id,
    pingRoles,
  );
  await thread
    .send({
      ...cardCreateOptions(openingCard),
      ...(pingRoles.length > 0
        ? { content: pingRoles.map((roleId) => `<@&${roleId}>`).join(" ") }
        : {}),
    })
    .catch(() => undefined);

  await applyAutoTags(services, config, ticket, thread, summary).catch(
    () => undefined,
  );

  await replySuccess(
    interaction,
    "Ticket Opened",
    `Your ${category.emoji ? `${category.emoji} ` : ""}**${category.name}** ticket is ready: <#${thread.id}>`,
  );
}

async function openTicketFromModal(
  interaction: ModalSubmitInteraction,
  services: ModuleServices,
  panelId: string,
  categoryId: string,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const policy = await validateTicketOpen(services, {
    guildId,
    userId: interaction.user.id,
    roleIds: memberRoleIds(interaction),
    panelId,
    categoryId,
  });
  if (!policy.ok) {
    await replyError(interaction, policy.title, policy.body);
    return;
  }

  const questions = openQuestions(policy.category);
  const answers = questions.map((_, index) =>
    interaction.fields.getTextInputValue(`t${index}`).trim(),
  );
  await createTicketFromAnswers(
    interaction,
    services,
    policy.panel,
    policy.category,
    policy.config,
    answers,
    questions,
  );
}

async function handleMenuSelect(
  interaction: Interaction & { values: string[]; customId: string },
  services: ModuleServices,
): Promise<void> {
  const parts = interaction.customId.split(":");
  const token = parts[3];
  const index = Number(parts[4]);
  if (!token || !Number.isInteger(index)) return;
  const session = await getTicketOpenSession(services, token);
  if (
    !session ||
    session.guildId !== interaction.guildId ||
    session.userId !== interaction.user.id
  ) {
    await replyError(
      interaction,
      "Prompt Expired",
      "This ticket prompt is no longer valid.",
    );
    return;
  }

  const category = await findCategory(
    services,
    session.guildId,
    session.categoryId,
  );
  if (!category) {
    await replyError(
      interaction,
      "Category Missing",
      "This ticket category no longer exists.",
    );
    return;
  }
  const questions = openQuestions(category);
  const question = questions[index];
  if (!question || !isMenuQuestion(question)) {
    await replyError(
      interaction,
      "Prompt Expired",
      "This ticket prompt is no longer valid.",
    );
    return;
  }

  const selected = interaction.values
    .map((value) => question.options[Number(value)]?.label ?? value)
    .join(", ");
  session.answers[index] = selected;
  await updateTicketOpenSession(services, session);
  await showMenuStep(interaction, services, session, questions, index + 1);
}

async function handleSkip(
  interaction: ButtonInteraction,
  services: ModuleServices,
): Promise<void> {
  const parts = interaction.customId.split(":");
  const token = parts[3];
  const index = Number(parts[4]);
  if (!token || !Number.isInteger(index)) return;
  const session = await getTicketOpenSession(services, token);
  if (
    !session ||
    session.guildId !== interaction.guildId ||
    session.userId !== interaction.user.id
  ) {
    await replyError(
      interaction,
      "Prompt Expired",
      "This ticket prompt is no longer valid.",
    );
    return;
  }
  const category = await findCategory(
    services,
    session.guildId,
    session.categoryId,
  );
  if (!category) {
    await replyError(
      interaction,
      "Category Missing",
      "This ticket category no longer exists.",
    );
    return;
  }
  session.answers[index] = "";
  await updateTicketOpenSession(services, session);
  await showMenuStep(
    interaction,
    services,
    session,
    openQuestions(category),
    index + 1,
  );
}

async function handleSessionModal(
  interaction: ModalSubmitInteraction,
  services: ModuleServices,
): Promise<void> {
  const token = interaction.customId.split(":")[3];
  if (!token) return;
  const session = await getTicketOpenSession(services, token);
  if (
    !session ||
    session.guildId !== interaction.guildId ||
    session.userId !== interaction.user.id
  ) {
    await replyError(
      interaction,
      "Prompt Expired",
      "This ticket prompt is no longer valid.",
    );
    return;
  }
  const category = await findCategory(
    services,
    session.guildId,
    session.categoryId,
  );
  if (!category) {
    await replyError(
      interaction,
      "Category Missing",
      "This ticket category no longer exists.",
    );
    return;
  }
  const questions = openQuestions(category);
  for (const entry of textEntries(questions)) {
    session.answers[entry.index] = interaction.fields
      .getTextInputValue(`t${entry.index}`)
      .trim();
  }
  await finishSession(interaction, services, session, questions);
}

async function handleFeedback(
  interaction: Interaction & { customId: string },
  services: ModuleServices,
): Promise<void> {
  const parts = interaction.customId.split(":");
  const ticketId = parts[2];
  const rating = Number(parts[3]);
  if (!ticketId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return;
  }
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;

  const ticket = await findTicketById(services, ticketId);
  if (!ticket || ticket.guildId !== guildId) {
    await replyError(
      interaction,
      "Ticket Missing",
      "That ticket no longer exists.",
    );
    return;
  }
  const config = await getTicketsConfig(services, guildId);
  const validation = validateFeedback(
    ticket,
    interaction.user.id,
    rating,
    feedbackEnabledFor(config, ticket.category),
  );
  if (!validation.ok) {
    await replyError(interaction, "Feedback Not Accepted", validation.reason);
    return;
  }
  await services.helpers.tickets.updateTicket(ticketId, { feedback: rating });
  await threadMessage(interaction, "Thanks for the feedback!").catch(
    () => undefined,
  );
  await replySuccess(
    interaction,
    "Feedback Recorded",
    `You rated this ticket **${rating}/5**. Thank you!`,
  );
}

async function threadMessage(
  interaction: Interaction & { channel: unknown },
  content: string,
): Promise<void> {
  const channel = interaction.channel;
  if (channel && "send" in channel) {
    await (channel as ThreadChannel).send({ content }).catch(() => undefined);
  }
}

async function openPanelCategory(
  interaction: Interaction,
  services: ModuleServices,
  guildId: string,
  panelId: string,
  categoryId: string,
): Promise<void> {
  const panel = await findPanel(services, panelId);
  const category = await findCategory(services, guildId, categoryId);
  if (!panel || !category || panel.guildId !== guildId) {
    await replyError(
      interaction,
      "Panel Unavailable",
      "This ticket panel is no longer available.",
    );
    return;
  }
  const policy = await validateTicketOpen(services, {
    guildId,
    userId: interaction.user.id,
    roleIds: memberRoleIds(interaction),
    panelId,
    categoryId,
  });
  if (!policy.ok) {
    await replyError(interaction, policy.title, policy.body);
    return;
  }
  await showTicketOpenMenu(
    interaction,
    services,
    policy.panel,
    policy.category,
  );
}

export async function handleTicketInteraction(
  interaction: Interaction,
  services: ModuleServices,
): Promise<void> {
  if (!interaction.isRepliable()) return;
  if (
    !("customId" in interaction) ||
    typeof interaction.customId !== "string"
  ) {
    return;
  }
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  if (!isTicketsModuleEnabled(services, guildId)) {
    await replyError(
      interaction,
      "Tickets Disabled",
      "The tickets module is disabled.",
    );
    return;
  }

  const parts = interaction.customId.split(":");
  if (parts[0] !== "tickets") return;

  if (interaction.isModalSubmit()) {
    if (parts[1] === "modal" && parts[2] === "open") {
      const panelId = parts[3];
      const categoryId = parts[4];
      if (panelId && categoryId) {
        await openTicketFromModal(interaction, services, panelId, categoryId);
      }
      return;
    }
    if (parts[1] === "open" && parts[2] === "modal") {
      await handleSessionModal(interaction, services);
      return;
    }
  }

  if (interaction.isButton()) {
    if (parts[1] === "open" && parts[2] === "skip") {
      await handleSkip(interaction, services);
      return;
    }
    if (parts[1] === "panel" && parts[2] === "open") {
      const panelId = parts[3];
      const categoryId = parts[4];
      if (panelId && categoryId) {
        await openPanelCategory(
          interaction,
          services,
          guildId,
          panelId,
          categoryId,
        );
      }
      return;
    }
    if (parts[1] === "feedback") {
      await handleFeedback(interaction, services);
      return;
    }
  }

  if (interaction.isAnySelectMenu()) {
    if (parts[1] === "open" && parts[2] === "menu") {
      await handleMenuSelect(interaction, services);
      return;
    }
    if (parts[1] === "panel" && parts[2] === "select") {
      const panelId = parts[3];
      const categoryId = interaction.values[0];
      if (panelId && categoryId) {
        await openPanelCategory(
          interaction,
          services,
          guildId,
          panelId,
          categoryId,
        );
      }
      return;
    }
  }
}
