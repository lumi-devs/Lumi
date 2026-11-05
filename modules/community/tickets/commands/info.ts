import { requireGuildId } from "@lumi/foundation";
import type { ModuleServices } from "@lumi/module-kit";
import { makeInfoCard, makeListCard, makeSuccessCard } from "@lumi/ui";
import type { ChatInputCommandInteraction } from "discord.js";
import { accessContextFromInteraction, ticketAccess } from "../access.js";
import { getTicketsConfig } from "../config.js";
import { PriorityEmoji } from "../constants.js";
import { ticketInfoCard } from "../panel.js";
import { feedbackEnabledFor } from "../policy.js";
import {
  findTicketByChannel,
  findTicketById,
  listTicketNotes,
  type TicketRecord,
} from "../repository.js";
import { validateFeedback } from "../validation.js";
import { replyCard, replyError, requireStaff } from "./shared.js";

export async function feedbackCommand(
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
    feedbackEnabledFor(config, ticket.category),
  );
  if (!validation.ok) {
    await replyError(interaction, "Feedback Not Accepted", validation.reason);
    return;
  }
  const comment =
    interaction.options.getString("comment")?.slice(0, 1000) ?? null;
  await services.helpers.tickets.updateTicket(ticket.id, {
    feedback: rating,
    feedbackComment: comment,
  });
  await replyCard(
    interaction,
    makeSuccessCard(
      "Feedback Recorded",
      `Thank you! Your rating of **${rating}/5** has been saved.`,
    ),
  );
}

export async function infoCommand(
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

export async function listCommand(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = requireGuildId(interaction.guildId);
  if (!guildId) return;
  const config = await getTicketsConfig(services, guildId);
  if (!(await requireStaff(interaction, services, config))) return;
  const status = interaction.options.getString("status") ?? "open";
  const rows = (await services.helpers.tickets
    .listTickets(guildId, status, 25)
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
