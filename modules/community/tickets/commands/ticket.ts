import type { ModuleServices } from "@lumi/module-kit";
import { makeInfoCard, makeSuccessCard } from "@lumi/ui";
import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { PriorityEmoji } from "../constants.js";
import { claimingEnabledFor } from "../policy.js";
import { closeTicket, resolveThread } from "../ticket-service.js";
import { canCloseTicket, isPriority } from "../validation.js";
import { replyCard, replyError, requireTicketAccess } from "./shared.js";

export async function closeCurrentTicket(
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

export async function claimTicket(
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
    await services.helpers.tickets.updateTicket(context.ticket.id, {
      claimedBy: null,
      claimedAt: null,
    });
    await replyCard(
      interaction,
      makeSuccessCard("Ticket Unclaimed", "This ticket is now unclaimed."),
    );
    return;
  }

  if (!claimingEnabledFor(context.ticket.category)) {
    await replyError(
      interaction,
      "Claiming Disabled",
      "Claiming is disabled for this category.",
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
  await services.helpers.tickets.updateTicket(context.ticket.id, {
    claimedBy: interaction.user.id,
    claimedAt: new Date(),
  });
  await replyCard(
    interaction,
    makeSuccessCard("Ticket Claimed", `You are now handling this ticket.`),
  );
}

export async function setPriority(
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
  await services.helpers.tickets.updateTicket(context.ticket.id, {
    priority: value,
  });
  await replyCard(
    interaction,
    makeSuccessCard(
      "Priority Updated",
      `${PriorityEmoji[value]} Priority set to **${value}**.`,
    ),
  );
}

export async function addNote(
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
  await services.helpers.tickets.createNote({
    ticketId: context.ticket.id,
    authorId: interaction.user.id,
    content: content.slice(0, 2000),
  });
  await replyCard(
    interaction,
    makeSuccessCard(
      "Note Saved",
      "The note is included in the ticket transcript.",
    ),
  );
}

export async function changeMember(
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
