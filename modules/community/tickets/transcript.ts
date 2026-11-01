import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ModuleServices } from "@lumi/module-kit";
import { cardCreateOptions, makeInfoCard } from "@lumi/ui";
import { AttachmentBuilder, type Guild } from "discord.js";
import type { TicketsConfig } from "./config.js";
import type {
  TranscriptData,
  TranscriptMessage,
  TranscriptNote,
} from "./html.js";
import type {
  TicketMessageRecord,
  TicketNoteRecord,
  TicketRecord,
} from "./repository.js";

const TranscriptRoot = "data/transcripts";

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "unknown";
}

export function transcriptRelativePath(
  guildId: string,
  ticketId: string,
): string {
  return `${TranscriptRoot}/${safeSegment(guildId)}/${safeSegment(ticketId)}.html`;
}

export function transcriptAbsolutePath(
  guildId: string,
  ticketId: string,
): string {
  return resolve(process.cwd(), transcriptRelativePath(guildId, ticketId));
}

export async function writeTranscriptFile(
  guildId: string,
  ticketId: string,
  html: string,
): Promise<string> {
  const path = transcriptAbsolutePath(guildId, ticketId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html, "utf8");
  return path;
}

export function buildTranscriptData(input: {
  ticket: TicketRecord;
  guild: Guild | null;
  messages: readonly TicketMessageRecord[];
  notes: readonly TicketNoteRecord[];
}): TranscriptData {
  const messages: TranscriptMessage[] = input.messages.map((message) => ({
    authorId: message.authorId,
    authorName: message.authorName,
    content: message.content,
    createdAt: message.createdAt,
    attachments: message.attachments,
  }));
  const notes: TranscriptNote[] = input.notes.map((note) => ({
    authorId: note.authorId,
    content: note.content,
    createdAt: note.createdAt,
  }));
  return {
    ticketId: input.ticket.id,
    guildId: input.ticket.guildId,
    guildName: input.guild?.name ?? null,
    categoryName: input.ticket.category?.name ?? null,
    userId: input.ticket.userId,
    subject: input.ticket.subject,
    status: input.ticket.status,
    priority: input.ticket.priority,
    claimedBy: input.ticket.claimedBy,
    closeReason: input.ticket.closeReason,
    closedBy: input.ticket.closedBy,
    createdAt: input.ticket.createdAt,
    closedAt: input.ticket.closedAt,
    messages,
    notes,
  };
}

export async function uploadTranscript(
  services: ModuleServices,
  config: TicketsConfig,
  ticket: TicketRecord,
  html: string,
): Promise<string | null> {
  if (!config.transcriptChannelId) return null;
  const channel = await services.client.channels
    .fetch(config.transcriptChannelId)
    .catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel)) return null;

  const attachment = new AttachmentBuilder(Buffer.from(html, "utf8"), {
    name: `ticket-${safeSegment(ticket.id)}.html`,
  });
  const card = makeInfoCard(
    "🎫 Ticket Transcript",
    [
      `**Ticket** \`${ticket.id}\``,
      `**Opener** <@${ticket.userId}>`,
      `**Category** ${ticket.category?.name ?? "None"}`,
      `**Closed by** ${ticket.closedBy ?? "Unknown"}`,
      `**Reason** ${ticket.closeReason ?? "No reason provided"}`,
    ],
    {
      footer: "The HTML transcript is attached and does not expire",
    },
  );

  const message = await channel
    .send({
      ...cardCreateOptions(card),
      files: [attachment],
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
  return message?.url ?? null;
}
