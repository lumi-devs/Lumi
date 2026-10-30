import {
  type CardReply,
  createActionButton,
  createStringSelectMenu,
  makeCard,
  makeInfoCard,
  makeSuccessCard,
  row,
} from "@lumi/ui";
import { ButtonStyle } from "discord.js";
import { type Priority, PriorityEmoji, TicketIds } from "./constants.js";
import type {
  TicketCategoryRecord,
  TicketPanelRecord,
  TicketRecord,
} from "./repository.js";
import { questionsOf } from "./repository.js";

const clip = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

export function panelCard(
  panel: TicketPanelRecord,
  categories: readonly TicketCategoryRecord[],
): CardReply {
  const usable = categories.filter((category) => category.enabled).slice(0, 25);
  const lines: string[] = [];
  if (panel.description) lines.push(panel.description);
  lines.push(
    usable.length === 0
      ? "No ticket categories are configured yet."
      : `Choose a category below, or press **Open Ticket** to start with **${clip(usable[0]?.name ?? "Support", 80)}**.`,
  );

  if (usable.length > 0) {
    lines.push(
      usable
        .map(
          (category) =>
            `${category.emoji ? `${category.emoji} ` : ""}**${category.name}**${
              category.description
                ? ` — ${clip(category.description, 100)}`
                : ""
            }`,
        )
        .join("\n"),
    );
  }

  const actionRows = [];
  if (usable.length > 0) {
    actionRows.push(
      row(
        createStringSelectMenu({
          customId: TicketIds.panelSelect(panel.id),
          placeholder: "Select a ticket category…",
          options: usable.map((category) => ({
            label: clip(category.name, 100),
            value: category.id,
            ...(category.description
              ? { description: clip(category.description, 100) }
              : {}),
            ...(category.emoji ? { emoji: category.emoji } : {}),
          })),
        }),
      ),
    );
    actionRows.push(
      row(
        createActionButton({
          customId: TicketIds.panelOpen(panel.id),
          label: "Open Ticket",
          emoji: "🎫",
          style: ButtonStyle.Success,
        }),
      ),
    );
  }

  return makeCard(undefined, panel.title, lines, {
    subtitle: "Private support threads",
    footer:
      "Tickets are created as private threads and are only visible to you and staff",
    separatorAboveActionRows: true,
    actionRows,
  });
}

export function ticketOpenedCard(
  ticket: TicketRecord,
  category: TicketCategoryRecord | null,
  answers: readonly string[],
  openerId: string,
  pingRoleIds: readonly string[] = [],
): CardReply {
  const questions = category ? questionsOf(category) : [];
  const answerLines = questions.map(
    (question, index) =>
      `**${clip(question.label, 80)}**\n${answers[index]?.trim() || "No answer provided"}`,
  );
  const body = [
    `**Opener** <@${openerId}>`,
    `**Category** ${category?.name ?? "None"}`,
    `**Priority** ${PriorityEmoji[ticket.priority as Priority] ?? "🔵"} ${ticket.priority}`,
    ...(ticket.subject ? [`**Subject** ${clip(ticket.subject, 200)}`] : []),
    ...(pingRoleIds.length > 0
      ? [`**Staff** ${pingRoleIds.map((roleId) => `<@&${roleId}>`).join(" ")}`]
      : []),
    ...(answerLines.length > 0 ? ["", ...answerLines] : []),
    "",
    "Use `/ticket` commands or the staff controls to manage this ticket.",
  ];
  return makeSuccessCard("🎫 Ticket Opened", body, {
    subtitle: category?.name ?? "Support ticket",
    breadcrumbs: ["Tickets", category?.name ?? "General"],
    footer: `Ticket ${ticket.id}`,
  });
}

export function ticketInfoCard(
  ticket: TicketRecord,
  notesCount: number,
): CardReply {
  const priority = PriorityEmoji[ticket.priority as Priority] ?? "🔵";
  const body = [
    `**Status** ${ticket.status === "open" ? "Open" : "Closed"}`,
    `**Category** ${ticket.category?.name ?? "None"}`,
    `**Opener** <@${ticket.userId}>`,
    `**Claimed by** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Unclaimed"}`,
    `**Priority** ${priority} ${ticket.priority}`,
    `**Subject** ${ticket.subject ?? "No subject"}`,
    `**Created** <t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:F>`,
    `**Last activity** <t:${Math.floor(new Date(ticket.lastActivityAt).getTime() / 1000)}:R>`,
    `**Staff notes** ${notesCount}`,
    `**Feedback** ${ticket.feedback ? `${ticket.feedback}/5` : "Not submitted"}${
      ticket.feedbackComment ? ` — ${clip(ticket.feedbackComment, 200)}` : ""
    }`,
    ...(ticket.closedAt
      ? [
          `**Closed** <t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:F>`,
          `**Close reason** ${ticket.closeReason ?? "No reason provided"}`,
        ]
      : []),
    ...(ticket.transcriptUrl ? [`**Transcript** ${ticket.transcriptUrl}`] : []),
  ];
  return makeInfoCard(`🎫 Ticket ${ticket.id}`, body, {
    subtitle: ticket.category?.name ?? "Support ticket",
    statusBadge: {
      status: ticket.status === "open" ? "open" : "closed",
      label: ticket.status.toUpperCase(),
    },
  });
}
