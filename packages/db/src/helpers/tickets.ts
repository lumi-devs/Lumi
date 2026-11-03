import type { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

type TicketCategoryCreateData = Omit<
  Prisma.TicketCategoryUncheckedCreateInput,
  "questions"
> & { questions: unknown };

type TicketMessageCreateData = Omit<
  Prisma.TicketMessageUncheckedCreateInput,
  "attachments"
> & { attachments: unknown };

export function createTicketsHelpers(ctx: DbContext) {
  const { prisma } = ctx;

  return {
    findTicketByChannel: (channelId: string) =>
      prisma.ticket.findUnique({
        where: { channelId },
        include: { category: true },
      }),

    findTicketById: (ticketId: string) =>
      prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { category: true },
      }),

    findPanel: (panelId: string) =>
      prisma.ticketPanel.findUnique({ where: { id: panelId } }),

    findCategory: (guildId: string, categoryId: string) =>
      prisma.ticketCategory.findFirst({
        where: { id: categoryId, guildId },
      }),

    findCategoryByName: (guildId: string, name: string) =>
      prisma.ticketCategory.findUnique({
        where: { guildId_name: { guildId, name } },
      }),

    listCategories: (
      guildId: string,
      options: { enabledOnly?: boolean; ids?: readonly string[] } = {},
    ) =>
      prisma.ticketCategory.findMany({
        where: {
          guildId,
          ...(options.enabledOnly ? { enabled: true } : {}),
          ...(options.ids && options.ids.length > 0
            ? { id: { in: [...options.ids] } }
            : {}),
        },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),

    countCategories: (guildId: string) =>
      prisma.ticketCategory.count({ where: { guildId } }),

    createCategory: (data: TicketCategoryCreateData) =>
      prisma.ticketCategory.create({
        data: {
          ...data,
          questions: data.questions as Prisma.InputJsonValue,
        },
      }),

    updateCategory: (categoryId: string, data: Record<string, unknown>) =>
      prisma.ticketCategory.update({
        where: { id: categoryId },
        data: data as unknown as Prisma.TicketCategoryUncheckedUpdateInput,
      }),

    deleteCategory: (categoryId: string) =>
      prisma.ticketCategory.delete({ where: { id: categoryId } }),

    createPanel: (data: Prisma.TicketPanelUncheckedCreateInput) =>
      prisma.ticketPanel.create({ data }),

    updatePanel: (
      panelId: string,
      data: Prisma.TicketPanelUncheckedUpdateInput,
    ) =>
      prisma.ticketPanel.update({
        where: { id: panelId },
        data,
      }),

    deletePanel: (panelId: string) =>
      prisma.ticketPanel.delete({ where: { id: panelId } }),

    listPanelsByCategory: (guildId: string, categoryId: string) =>
      prisma.ticketPanel.findMany({
        where: { guildId, categoryIds: { has: categoryId } },
      }),

    countOpenTickets: (guildId: string, userId: string) =>
      prisma.ticket.count({
        where: { guildId, userId, status: "open" },
      }),

    countGuildTickets: (guildId: string) =>
      prisma.ticket.count({ where: { guildId } }),

    isBlacklisted: async (guildId: string, userId: string) => {
      const row = await prisma.ticketBlacklist.findUnique({
        where: { guildId_userId: { guildId, userId } },
      });
      return Boolean(row);
    },

    upsertBlacklist: (
      guildId: string,
      userId: string,
      data: { reason: string | null; createdBy: string },
    ) =>
      prisma.ticketBlacklist.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: data,
        create: { guildId, userId, ...data },
      }),

    removeBlacklist: (guildId: string, userId: string) =>
      prisma.ticketBlacklist.delete({
        where: { guildId_userId: { guildId, userId } },
      }),

    listBlacklist: (guildId: string, take = 25) =>
      prisma.ticketBlacklist.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take,
      }),

    listMessages: (ticketId: string) =>
      prisma.ticketMessage.findMany({
        where: { ticketId },
        orderBy: { createdAt: "asc" },
      }),

    messageExists: (ticketId: string, messageId: string) =>
      prisma.ticketMessage.findFirst({
        where: { ticketId, messageId },
        select: { id: true },
      }),

    createMessage: (data: TicketMessageCreateData) =>
      prisma.ticketMessage.create({
        data: {
          ...data,
          attachments: data.attachments as Prisma.InputJsonValue,
        },
      }),

    listNotes: (ticketId: string) =>
      prisma.ticketNote.findMany({
        where: { ticketId },
        orderBy: { createdAt: "asc" },
      }),

    createNote: (data: Prisma.TicketNoteUncheckedCreateInput) =>
      prisma.ticketNote.create({ data }),

    createTicket: (data: Prisma.TicketUncheckedCreateInput) =>
      prisma.ticket.create({
        data,
        include: { category: true },
      }),

    updateTicket: (ticketId: string, data: Prisma.TicketUpdateInput) =>
      prisma.ticket.update({
        where: { id: ticketId },
        data,
      }),

    updateTicketWithCategory: (
      ticketId: string,
      data: Prisma.TicketUpdateInput,
    ) =>
      prisma.ticket.update({
        where: { id: ticketId },
        data,
        include: { category: true },
      }),

    listTickets: (guildId: string, status: string, take = 25) =>
      prisma.ticket.findMany({
        where: {
          guildId,
          ...(status === "all" ? {} : { status }),
        },
        include: { category: true },
        orderBy: { createdAt: "desc" },
        take,
      }),

    listOpenTicketGuildIds: () =>
      prisma.ticket.findMany({
        where: { status: "open" },
        select: { guildId: true },
        distinct: ["guildId"],
      }),

    listOpenTickets: (guildId: string) =>
      prisma.ticket.findMany({
        where: { guildId, status: "open" },
      }),

    findTag: (guildId: string, name: string) =>
      prisma.ticketTag.findUnique({
        where: { guildId_name: { guildId, name } },
      }),

    createTag: (data: Prisma.TicketTagUncheckedCreateInput) =>
      prisma.ticketTag.create({ data }),

    deleteTag: (guildId: string, name: string) =>
      prisma.ticketTag.delete({
        where: { guildId_name: { guildId, name } },
      }),

    listTags: (guildId: string, take = 25) =>
      prisma.ticketTag.findMany({
        where: { guildId },
        orderBy: { name: "asc" },
        take,
      }),

    listTicketsForUser: (guildId: string, userId: string) =>
      prisma.ticket.findMany({
        where: { guildId, userId },
        include: { category: true },
        orderBy: { createdAt: "desc" },
      }),

    async anonymiseUserData(guildId: string, userId: string) {
      const anonymousId = "deleted-user";
      const [tickets, messages, notes, blacklist] = await prisma.$transaction([
        prisma.ticket.updateMany({
          where: { guildId, userId },
          data: { userId: anonymousId },
        }),
        prisma.ticketMessage.updateMany({
          where: { ticket: { guildId }, authorId: userId },
          data: { authorId: anonymousId, authorName: "Deleted User" },
        }),
        prisma.ticketNote.updateMany({
          where: { ticket: { guildId }, authorId: userId },
          data: { authorId: anonymousId },
        }),
        prisma.ticketBlacklist.deleteMany({ where: { guildId, userId } }),
      ]);
      return {
        deleted: blacklist.count,
        anonymised: tickets.count + messages.count + notes.count,
      };
    },
  };
}
