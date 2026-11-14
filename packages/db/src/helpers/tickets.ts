import { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

type TicketCategoryCreateData = Omit<
  Prisma.TicketCategoryUncheckedCreateInput,
  "questions"
> & { questions: unknown };

type TicketCategoryUpdateData = Omit<
  Prisma.TicketCategoryUncheckedUpdateInput,
  "questions"
> & { questions?: unknown };

type TicketMessageCreateData = Omit<
  Prisma.TicketMessageUncheckedCreateInput,
  "attachments"
> & { attachments: unknown };

type TicketTagCreateData = Omit<
  Prisma.TicketTagUncheckedCreateInput,
  "regex" | "autoTag"
> & { regex?: string | null; autoTag?: boolean };

const CategoriesTtlMs = 30_000;
const TagsTtlMs = 30_000;

const categoriesKey = (guildId: string) => `tickets:categories:${guildId}`;
const tagsKey = (guildId: string) => `tickets:tags:${guildId}`;

export function createTicketsHelpers(ctx: DbContext) {
  const { prisma, cache } = ctx;

  async function loadCategories(guildId: string) {
    return (
      (await cache.getOrLoad(categoriesKey(guildId), CategoriesTtlMs, () =>
        prisma.ticketCategory.findMany({
          where: { guildId },
          orderBy: [{ position: "asc" }, { name: "asc" }],
        }),
      )) ?? []
    );
  }

  async function loadTags(guildId: string) {
    return (
      (await cache.getOrLoad(tagsKey(guildId), TagsTtlMs, () =>
        prisma.ticketTag.findMany({
          where: { guildId },
          orderBy: { name: "asc" },
        }),
      )) ?? []
    );
  }

  async function invalidateCategories(guildId: string): Promise<void> {
    await cache.del(categoriesKey(guildId)).catch(() => undefined);
  }

  async function invalidateTags(guildId: string): Promise<void> {
    await cache.del(tagsKey(guildId)).catch(() => undefined);
  }

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

    findCategory: async (guildId: string, categoryId: string) =>
      (await loadCategories(guildId)).find((row) => row.id === categoryId) ??
      null,

    findCategoryByName: async (guildId: string, name: string) =>
      (await loadCategories(guildId)).find((row) => row.name === name) ?? null,

    listCategories: async (
      guildId: string,
      options: { enabledOnly?: boolean; ids?: readonly string[] } = {},
    ) => {
      const ids = options.ids ? new Set(options.ids) : null;
      return (await loadCategories(guildId)).filter(
        (row) =>
          (!options.enabledOnly || row.enabled) && (!ids || ids.has(row.id)),
      );
    },

    countCategories: (guildId: string) =>
      prisma.ticketCategory.count({ where: { guildId } }),

    createCategory: async (data: TicketCategoryCreateData) => {
      const category = await prisma.ticketCategory.create({
        data: {
          ...data,
          questions: data.questions as Prisma.InputJsonValue,
        },
      });
      await invalidateCategories(category.guildId);
      return category;
    },

    updateCategory: async (
      categoryId: string,
      data: TicketCategoryUpdateData,
    ) => {
      const { questions, ...rest } = data;
      const category = await prisma.ticketCategory.update({
        where: { id: categoryId },
        data: {
          ...rest,
          ...(questions === undefined
            ? {}
            : { questions: questions as Prisma.InputJsonValue }),
        },
      });
      await invalidateCategories(category.guildId);
      return category;
    },

    deleteCategory: async (categoryId: string) => {
      const category = await prisma.ticketCategory.delete({
        where: { id: categoryId },
      });
      await invalidateCategories(category.guildId);
      return category;
    },

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

    countOpenTicketsForCategory: (
      guildId: string,
      userId: string,
      categoryId: string,
    ) =>
      prisma.ticket.count({
        where: { guildId, userId, categoryId, status: "open" },
      }),

    countOpenTicketsInCategory: (guildId: string, categoryId: string) =>
      prisma.ticket.count({
        where: { guildId, categoryId, status: "open" },
      }),

    findLatestTicketForUserCategory: (
      guildId: string,
      userId: string,
      categoryId: string,
    ) =>
      prisma.ticket.findFirst({
        where: { guildId, userId, categoryId },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
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

    recordFirstResponse: (ticketId: string, userId: string, at: Date) =>
      prisma.ticket.updateMany({
        where: { id: ticketId, firstResponseAt: null },
        data: { firstResponseAt: at, firstResponseBy: userId },
      }),

    claimTicketIfUnclaimed: (ticketId: string, userId: string, at: Date) =>
      prisma.ticket.updateMany({
        where: { id: ticketId, claimedBy: null },
        data: { claimedBy: userId, claimedAt: at },
      }),

    claimTicketAsAdmin: (ticketId: string, userId: string, at: Date) =>
      prisma.ticket.updateMany({
        where: {
          id: ticketId,
          OR: [{ claimedBy: null }, { claimedBy: { not: userId } }],
        },
        data: { claimedBy: userId, claimedAt: at },
      }),

    releaseTicketIfClaimedBy: (ticketId: string, userId: string) =>
      prisma.ticket.updateMany({
        where: { id: ticketId, claimedBy: userId },
        data: { claimedBy: null, claimedAt: null },
      }),

    releaseTicketIfClaimed: (ticketId: string) =>
      prisma.ticket.updateMany({
        where: { id: ticketId, claimedBy: { not: null } },
        data: { claimedBy: null, claimedAt: null },
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

    listClosedTicketGuildIds: () =>
      prisma.ticket.findMany({
        where: { status: "closed" },
        select: { guildId: true },
        distinct: ["guildId"],
      }),

    listExpiredClosedTickets: (guildId: string, before: Date, take = 100) =>
      prisma.ticket.findMany({
        where: { guildId, status: "closed", closedAt: { lt: before } },
        select: { id: true },
        orderBy: { closedAt: "asc" },
        take,
      }),

    deleteTickets: (ids: readonly string[]) =>
      prisma.ticket.deleteMany({ where: { id: { in: [...ids] } } }),

    findTag: async (guildId: string, name: string) =>
      (await loadTags(guildId)).find((row) => row.name === name) ?? null,

    createTag: async (data: TicketTagCreateData) => {
      const tag = await prisma.ticketTag.create({
        data: {
          ...data,
          regex: data.regex ?? null,
          autoTag: data.autoTag ?? false,
        },
      });
      await invalidateTags(tag.guildId);
      return tag;
    },

    updateTag: async (
      guildId: string,
      name: string,
      data: {
        name?: string;
        content?: string;
        regex?: string | null;
        autoTag?: boolean;
      },
    ) => {
      const tag = await prisma.ticketTag.update({
        where: { guildId_name: { guildId, name } },
        data,
      });
      await invalidateTags(guildId);
      return tag;
    },

    deleteTag: async (guildId: string, name: string) => {
      const tag = await prisma.ticketTag.delete({
        where: { guildId_name: { guildId, name } },
      });
      await invalidateTags(guildId);
      return tag;
    },

    listTags: async (guildId: string, take = 25) =>
      (await loadTags(guildId)).slice(0, take),

    listAutoTags: async (guildId: string) =>
      (await loadTags(guildId)).filter((tag) => tag.autoTag && tag.regex),

    hasTagApplication: async (ticketId: string, tagId: string) => {
      const row = await prisma.ticketTagApplication.findUnique({
        where: { ticketId_tagId: { ticketId, tagId } },
        select: { id: true },
      });
      return Boolean(row);
    },

    createTagApplication: async (ticketId: string, tagId: string) => {
      await prisma.ticketTagApplication.create({
        data: { ticketId, tagId },
      });
    },

    listTicketsForUser: (guildId: string, userId: string) =>
      prisma.ticket.findMany({
        where: { guildId, userId },
        include: { category: true },
        orderBy: { createdAt: "desc" },
      }),

    ticketStats: async (guildId: string, categoryId?: string) => {
      const categoryFilter = categoryId
        ? Prisma.sql`AND "category_id" = ${categoryId}`
        : Prisma.empty;
      const [open, row] = await Promise.all([
        prisma.ticket.count({
          where: {
            guildId,
            status: "open",
            ...(categoryId ? { categoryId } : {}),
          },
        }),
        prisma.$queryRaw<
          Array<{
            closed: number;
            avg_response_seconds: number | string | null;
            avg_resolution_seconds: number | string | null;
            avg_feedback: number | string | null;
          }>
        >(Prisma.sql`
          SELECT
            COUNT(*)::int AS closed,
            AVG(EXTRACT(EPOCH FROM ("first_response_at" - "created_at")))
              FILTER (WHERE "first_response_at" IS NOT NULL) AS avg_response_seconds,
            AVG(EXTRACT(EPOCH FROM ("closed_at" - "created_at")))
              FILTER (WHERE "closed_at" IS NOT NULL) AS avg_resolution_seconds,
            AVG("feedback") FILTER (WHERE "feedback" IS NOT NULL) AS avg_feedback
          FROM "tickets"
          WHERE "guild_id" = ${guildId}
            AND "status" = 'closed'
            ${categoryFilter}
        `),
      ]);
      const stats = row[0];
      const numberOrNull = (value: number | string | null | undefined) => {
        if (value === null || value === undefined) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      return {
        open,
        closed: Number(stats?.closed ?? 0),
        avgResponseSeconds: numberOrNull(stats?.avg_response_seconds),
        avgResolutionSeconds: numberOrNull(stats?.avg_resolution_seconds),
        avgFeedback: numberOrNull(stats?.avg_feedback),
      };
    },

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
