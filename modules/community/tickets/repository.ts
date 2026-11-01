import type { ModuleServices } from "@lumi/module-kit";
import type { TicketQuestion } from "./config.js";
import { escapeHtml } from "./html.js";

export interface TicketCategoryRecord {
  id: string;
  guildId: string;
  name: string;
  emoji: string | null;
  description: string | null;
  staffRoleIds: string[];
  pingRoleIds: string[];
  questions: unknown;
  namingTemplate: string;
  defaultPriority: string;
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

export function prismaOf(services: ModuleServices): any {
  return services.db?.prisma ?? (services as { prisma?: unknown }).prisma;
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
  const prisma = prismaOf(services);
  if (!prisma?.ticket) return null;
  try {
    return (await prisma.ticket.findUnique({
      where: { channelId },
      include: { category: true },
    })) as TicketRecord | null;
  } catch {
    return null;
  }
}

export async function findTicketById(
  services: ModuleServices,
  ticketId: string,
): Promise<TicketRecord | null> {
  const prisma = prismaOf(services);
  if (!prisma?.ticket) return null;
  try {
    return (await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { category: true },
    })) as TicketRecord | null;
  } catch {
    return null;
  }
}

export async function findPanel(
  services: ModuleServices,
  panelId: string,
): Promise<TicketPanelRecord | null> {
  const prisma = prismaOf(services);
  if (!prisma?.ticketPanel) return null;
  try {
    return (await prisma.ticketPanel.findUnique({
      where: { id: panelId },
    })) as TicketPanelRecord | null;
  } catch {
    return null;
  }
}

export async function findCategory(
  services: ModuleServices,
  guildId: string,
  categoryId: string,
): Promise<TicketCategoryRecord | null> {
  const prisma = prismaOf(services);
  if (!prisma?.ticketCategory) return null;
  try {
    return (await prisma.ticketCategory.findFirst({
      where: { id: categoryId, guildId },
    })) as TicketCategoryRecord | null;
  } catch {
    return null;
  }
}

export async function listCategories(
  services: ModuleServices,
  guildId: string,
  options: { enabledOnly?: boolean; ids?: readonly string[] } = {},
): Promise<TicketCategoryRecord[]> {
  const prisma = prismaOf(services);
  if (!prisma?.ticketCategory) return [];
  try {
    const rows = (await prisma.ticketCategory.findMany({
      where: {
        guildId,
        ...(options.enabledOnly ? { enabled: true } : {}),
        ...(options.ids && options.ids.length > 0
          ? { id: { in: [...options.ids] } }
          : {}),
      },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    })) as TicketCategoryRecord[];
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
  const prisma = prismaOf(services);
  if (!prisma?.ticket) return 0;
  try {
    return (await prisma.ticket.count({
      where: { guildId, userId, status: "open" },
    })) as number;
  } catch {
    return 0;
  }
}

export async function countGuildTickets(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  const prisma = prismaOf(services);
  if (!prisma?.ticket) return 0;
  try {
    return (await prisma.ticket.count({ where: { guildId } })) as number;
  } catch {
    return 0;
  }
}

export async function isBlacklisted(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<boolean> {
  const prisma = prismaOf(services);
  if (!prisma?.ticketBlacklist) return false;
  try {
    const row = await prisma.ticketBlacklist.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function listTicketMessages(
  services: ModuleServices,
  ticketId: string,
): Promise<TicketMessageRecord[]> {
  const prisma = prismaOf(services);
  if (!prisma?.ticketMessage) return [];
  try {
    const rows = (await prisma.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
    })) as TicketMessageRecord[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function listTicketNotes(
  services: ModuleServices,
  ticketId: string,
): Promise<TicketNoteRecord[]> {
  const prisma = prismaOf(services);
  if (!prisma?.ticketNote) return [];
  try {
    const rows = (await prisma.ticketNote.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
    })) as TicketNoteRecord[];
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
  const prisma = prismaOf(services);
  if (!prisma?.ticketMessage) return false;
  const attachments = attachmentMetadata(message.attachments);
  if (!message.content.trim() && attachments.length === 0) return false;
  try {
    const existing = await prisma.ticketMessage.findFirst({
      where: { ticketId, messageId: message.id },
      select: { id: true },
    });
    if (existing) return false;
    await prisma.ticketMessage.create({
      data: {
        ticketId,
        messageId: message.id,
        authorId: message.author.id,
        authorName:
          message.member?.displayName ??
          message.author.globalName ??
          message.author.username,
        content: escapeHtml(message.content),
        attachments,
        ...(message.createdAt
          ? { createdAt: new Date(message.createdAt) }
          : {}),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export function questionsOf(category: TicketCategoryRecord): TicketQuestion[] {
  if (!Array.isArray(category.questions)) return [];
  return category.questions.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const question = entry as Partial<TicketQuestion>;
    if (typeof question.label !== "string" || !question.label.trim()) return [];
    return [
      {
        label: question.label.trim().slice(0, 45),
        placeholder:
          typeof question.placeholder === "string"
            ? question.placeholder.slice(0, 100)
            : undefined,
        required: question.required === true,
        style: question.style === "long" ? "long" : "short",
        maxLength:
          typeof question.maxLength === "number"
            ? question.maxLength
            : undefined,
      } satisfies TicketQuestion,
    ];
  });
}
