import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  createActionButton,
  makeInfoCard,
  row,
} from "@lumi/ui";
import { ButtonStyle, type Guild, type ThreadChannel } from "discord.js";
import { getTicketsConfig } from "./config.js";
import { TicketIds, TicketsModuleName } from "./constants.js";
import { renderTranscript } from "./html.js";
import { selectInactiveTickets } from "./inactivity.js";
import {
  archiveMessage,
  listTicketMessages,
  listTicketNotes,
  type TicketRecord,
} from "./repository.js";
import {
  buildTranscriptData,
  transcriptRelativePath,
  uploadTranscript,
  writeTranscriptFile,
} from "./transcript.js";
import { validateCloseReason } from "./validation.js";

export async function resolveThread(
  services: ModuleServices,
  guild: Guild | null,
  channelId: string,
): Promise<ThreadChannel | null> {
  if (guild) {
    const cached = guild.channels.cache.get(channelId);
    if (cached?.isThread()) return cached;
    const fetched = await guild.channels.fetch(channelId).catch(() => null);
    if (fetched?.isThread()) return fetched;
    return null;
  }
  const channel = await services.client.channels
    .fetch(channelId)
    .catch(() => null);
  return channel?.isThread() ? channel : null;
}

export async function archiveThreadMessages(
  services: ModuleServices,
  ticket: TicketRecord,
  thread: ThreadChannel,
): Promise<void> {
  let before: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const batch = await thread.messages
      .fetch({ limit: 100, ...(before ? { before } : {}) })
      .catch(() => null);
    if (!batch || batch.size === 0) break;
    const messages = [...batch.values()];
    for (const message of messages) {
      await archiveMessage(services, ticket.id, {
        id: message.id,
        content: message.content,
        author: message.author,
        member: message.member ?? null,
        createdAt: message.createdAt,
        attachments: message.attachments,
      });
    }
    before = messages[messages.length - 1]?.id;
    if (!before || messages.length < 100) break;
  }
}

async function sendFeedbackPrompt(
  thread: ThreadChannel | null,
  ticket: TicketRecord,
): Promise<void> {
  if (!thread) return;
  const buttons = [1, 2, 3, 4, 5].map((rating) =>
    createActionButton({
      customId: TicketIds.feedback(ticket.id, rating),
      label: String(rating),
      emoji:
        rating === 1
          ? "😞"
          : rating === 2
            ? "🙁"
            : rating === 3
              ? "😐"
              : rating === 4
                ? "🙂"
                : "😄",
      style:
        rating >= 4
          ? ButtonStyle.Success
          : rating <= 2
            ? ButtonStyle.Danger
            : ButtonStyle.Secondary,
    }),
  );
  const card = makeInfoCard(
    "How did we do?",
    [
      `<@${ticket.userId}>, this ticket is now closed.`,
      "Use the buttons below to rate your support experience from 1 to 5.",
    ],
    {
      footer: "Feedback can only be submitted once",
      separatorAboveActionRows: true,
      actionRows: [row(...buttons)],
    },
  );
  await thread.send(cardCreateOptions(card)).catch(() => undefined);
}

export interface CloseTicketResult {
  ticket: TicketRecord;
  transcriptPath: string;
  transcriptUrl: string | null;
}

export async function closeTicket(
  services: ModuleServices,
  guild: Guild | null,
  ticket: TicketRecord,
  actorId: string,
  rawReason: string | null | undefined,
): Promise<CloseTicketResult> {
  const config = await getTicketsConfig(services, ticket.guildId);
  const reason = validateCloseReason(rawReason);
  const thread = await resolveThread(services, guild, ticket.channelId);

  if (thread) await archiveThreadMessages(services, ticket, thread);

  const messages = await listTicketMessages(services, ticket.id);
  const notes = await listTicketNotes(services, ticket.id);
  const closedAt = new Date();
  const closedTicket: TicketRecord = {
    ...ticket,
    status: "closed",
    closedBy: actorId,
    closedAt,
    closeReason: reason,
  };

  const html = renderTranscript(
    buildTranscriptData({ ticket: closedTicket, guild, messages, notes }),
  );
  const transcriptPath = await writeTranscriptFile(
    ticket.guildId,
    ticket.id,
    html,
  );
  const uploadedUrl = await uploadTranscript(
    services,
    config,
    closedTicket,
    html,
  );
  const transcriptUrl =
    uploadedUrl ?? transcriptRelativePath(ticket.guildId, ticket.id);

  const updated = (await services.helpers.tickets.updateTicketWithCategory(
    ticket.id,
    {
      status: "closed",
      closedBy: actorId,
      closedAt,
      closeReason: reason,
      transcriptUrl,
    },
  )) as TicketRecord;

  if (config.feedbackEnabled) {
    await sendFeedbackPrompt(thread, updated);
  }

  if (thread) {
    await thread.setLocked(true, reason).catch(() => undefined);
    await thread.setArchived(true, reason).catch(() => undefined);
  }

  return { ticket: updated, transcriptPath, transcriptUrl };
}

export async function sweepInactiveTickets(
  services: ModuleServices,
  now = new Date(),
): Promise<number> {
  const guilds = (await services.helpers.tickets
    .listOpenTicketGuildIds()
    .catch(() => [])) as Array<{ guildId: string }>;

  let closed = 0;
  for (const { guildId } of guilds) {
    if (!services.modules.isEnabled(guildId, TicketsModuleName)) continue;
    const config = await getTicketsConfig(services, guildId);
    if (!config.autoCloseEnabled) continue;

    const rows = (await services.helpers.tickets
      .listOpenTickets(guildId)
      .catch(() => [])) as TicketRecord[];
    const inactive = selectInactiveTickets(
      rows,
      now,
      config.autoCloseMinutes * 60_000,
    ).slice(0, 50);
    if (inactive.length === 0) continue;

    const guild = await services.client.guilds.fetch(guildId).catch(() => null);
    for (const ticket of inactive) {
      try {
        await closeTicket(
          services,
          guild,
          ticket,
          "system",
          "Closed automatically due to inactivity",
        );
        closed += 1;
      } catch (error) {
        services.observability?.logger?.warn?.("tickets auto-close failed", {
          guildId,
          ticketId: ticket.id,
          error,
        });
      }
    }
  }
  return closed;
}
