import type { ModuleServices } from "@lumi/module-kit";
import { normalizeQuestions, type TicketQuestion } from "./config.js";
import { escapeHtml } from "./html.js";

export interface TicketCategoryRecord {
  id: string;
  guildId: string;
  name: string;
  emoji: string | null;
  description: string | null;
  staffRoleIds: string[];
  pingRoleIds: string[];
  requiredRoleIds: string[];
  questions: unknown;
  namingTemplate: string;
  defaultPriority: string;
  openingMessage: string | null;
  cooldownSeconds: number;
  memberLimit: number;
  totalLimit: number;
  claimingEnabled: boolean;
  feedbackEnabled: boolean;
  position: number;
  enabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TicketRecord {
  id: string;
  guildId: string;
  categoryId: string | null;
  category?: TicketCategoryRecord | null;
  channelId: string;
  userId: string;
  status: string;
  claimedBy: string | null;
  claimedAt: Date | string | null;
  firstResponseAt: Date | string | null;
  firstResponseBy: string | null;
  priority: string;
  subject: string | null;
  closeReason: string | null;
  closedBy: string | null;
  closedAt: Date | string | null;
  transcriptUrl: string | null;
  feedback: number | null;
  feedbackComment: string | null;
  lastActivityAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TicketPanelRecord {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string | null;
  categoryIds: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TicketMessageRecord {
  id: string;
  ticketId: string;
  messageId: string | null;
  authorId: string;
  authorName: string;
  content: string;
  attachments: unknown;
  createdAt: Date | string;
}

export interface TicketNoteRecord {
  id: string;
  ticketId: string;
  authorId: string;
  content: string;
  createdAt: Date | string;
}

export interface AttachmentMetadata {
  name: string;
  url: string;
  size: number;
  contentType: string | null;
}

export function attachmentMetadata(attachments: unknown): AttachmentMetadata[] {
  const collection = attachments as {
    values?: () => Iterable<{
      name?: string;
      url?: string;
      size?: number;
      contentType?: string | null;
    }>;
  };
  const values =
    typeof collection?.values === "function" ? [...collection.values()] : [];
  return values
    .filter((entry) => typeof entry?.url === "string" && entry.url.length > 0)
    .map((entry) => ({
      name: entry.name ?? "attachment",
      url: entry.url ?? "",
      size: typeof entry.size === "number" ? entry.size : 0,
      contentType: entry.contentType ?? null,
    }));
}

export async function findTicketByChannel(
  services: ModuleServices,
  channelId: string,
): Promise<TicketRecord | null> {
  try {
    return (await services.helpers.tickets.findTicketByChannel(
      channelId,
    )) as TicketRecord | null;
  } catch {
    return null;
  }
}

export async function findTicketById(
  services: ModuleServices,
  ticketId: string,
): Promise<TicketRecord | null> {
  try {
    return (await services.helpers.tickets.findTicketById(
      ticketId,
    )) as TicketRecord | null;
  } catch {
    return null;
  }
}

export async function findPanel(
  services: ModuleServices,
  panelId: string,
): Promise<TicketPanelRecord | null> {
  try {
    return (await services.helpers.tickets.findPanel(
      panelId,
    )) as TicketPanelRecord | null;
  } catch {
    return null;
  }
}

export async function findCategory(
  services: ModuleServices,
  guildId: string,
  categoryId: string,
): Promise<TicketCategoryRecord | null> {
  try {
    return (await services.helpers.tickets.findCategory(
      guildId,
      categoryId,
    )) as TicketCategoryRecord | null;
  } catch {
    return null;
  }
}

export async function listCategories(
  services: ModuleServices,
  guildId: string,
  options: { enabledOnly?: boolean; ids?: readonly string[] } = {},
): Promise<TicketCategoryRecord[]> {
  try {
    const rows = (await services.helpers.tickets.listCategories(
      guildId,
      options,
    )) as TicketCategoryRecord[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function countOpenTickets(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<number> {
  try {
    return await services.helpers.tickets.countOpenTickets(guildId, userId);
  } catch {
    return 0;
  }
}

export async function countOpenTicketsForCategory(
  services: ModuleServices,
  guildId: string,
  userId: string,
  categoryId: string,
): Promise<number> {
  try {
    return await services.helpers.tickets.countOpenTicketsForCategory(
      guildId,
      userId,
      categoryId,
    );
  } catch {
    return 0;
  }
}

export async function countOpenTicketsInCategory(
  services: ModuleServices,
  guildId: string,
  categoryId: string,
): Promise<number> {
  try {
    return await services.helpers.tickets.countOpenTicketsInCategory(
      guildId,
      categoryId,
    );
  } catch {
    return 0;
  }
}

export async function findLatestTicketForUserCategory(
  services: ModuleServices,
  guildId: string,
  userId: string,
  categoryId: string,
): Promise<{ id: string; createdAt: Date | string } | null> {
  try {
    return (await services.helpers.tickets.findLatestTicketForUserCategory(
      guildId,
      userId,
      categoryId,
    )) as { id: string; createdAt: Date | string } | null;
  } catch {
    return null;
  }
}

export async function countGuildTickets(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  try {
    return await services.helpers.tickets.countGuildTickets(guildId);
  } catch {
    return 0;
  }
}

export async function isBlacklisted(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<boolean> {
  try {
    return await services.helpers.tickets.isBlacklisted(guildId, userId);
  } catch {
    return false;
  }
}

export async function listTicketMessages(
  services: ModuleServices,
  ticketId: string,
): Promise<TicketMessageRecord[]> {
  try {
    const rows = (await services.helpers.tickets.listMessages(
      ticketId,
    )) as TicketMessageRecord[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function listTicketNotes(
  services: ModuleServices,
  ticketId: string,
): Promise<TicketNoteRecord[]> {
  try {
    const rows = (await services.helpers.tickets.listNotes(
      ticketId,
    )) as TicketNoteRecord[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function archiveMessage(
  services: ModuleServices,
  ticketId: string,
  message: {
    id: string;
    content: string;
    author: { id: string; username: string; globalName?: string | null };
    member?: { displayName?: string | null } | null;
    createdAt?: Date | string;
    attachments?: unknown;
  },
): Promise<boolean> {
  const attachments = attachmentMetadata(message.attachments);
  if (!message.content.trim() && attachments.length === 0) return false;
  try {
    const existing = await services.helpers.tickets.messageExists(
      ticketId,
      message.id,
    );
    if (existing) return false;
    await services.helpers.tickets.createMessage({
      ticketId,
      messageId: message.id,
      authorId: message.author.id,
      authorName:
        message.member?.displayName ??
        message.author.globalName ??
        message.author.username,
      content: escapeHtml(message.content),
      attachments,
      ...(message.createdAt ? { createdAt: new Date(message.createdAt) } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

export function questionsOf(category: TicketCategoryRecord): TicketQuestion[] {
  return normalizeQuestions(category.questions);
}
