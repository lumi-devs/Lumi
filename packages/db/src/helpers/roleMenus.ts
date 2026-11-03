import type { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

export function createRoleMenuHelpers(ctx: DbContext) {
  const { prisma } = ctx;

  return {
    findGroup: (guildId: string, reference: string) =>
      prisma.roleMenuGroup.findFirst({
        where: { guildId, OR: [{ id: reference }, { name: reference }] },
        include: { options: { orderBy: { position: "asc" } } },
      }),
    findGroupById: (guildId: string, groupId: string) =>
      prisma.roleMenuGroup.findFirst({
        where: { id: groupId, guildId },
        include: { options: { orderBy: { position: "asc" } } },
      }),
    findGroupNameConflict: (
      guildId: string,
      name: string,
      excludeId?: string,
    ) =>
      prisma.roleMenuGroup.findFirst({
        where: excludeId
          ? { guildId, name, id: { not: excludeId } }
          : { guildId, name },
        select: { id: true },
      }),
    searchGroupNames: (guildId: string, query: string) =>
      prisma.roleMenuGroup.findMany({
        where: {
          guildId,
          name: { contains: query, mode: "insensitive" },
        },
        orderBy: { name: "asc" },
        take: 25,
        select: { name: true },
      }),
    listGroups: (guildId: string) =>
      prisma.roleMenuGroup.findMany({
        where: { guildId },
        include: { options: { select: { id: true } } },
        orderBy: { name: "asc" },
      }),
    createGroup: (data: Prisma.RoleMenuGroupUncheckedCreateInput) =>
      prisma.roleMenuGroup.create({ data }),
    updateGroup: (id: string, data: Record<string, unknown>) =>
      prisma.roleMenuGroup.update({
        where: { id },
        data: data as Prisma.RoleMenuGroupUncheckedUpdateInput,
      }),
    deleteGroup: (id: string) => prisma.roleMenuGroup.delete({ where: { id } }),

    findMenuMessage: (messageId: string) =>
      prisma.roleMenuMessage.findUnique({ where: { messageId } }),
    listGroupMessages: (groupId: string) =>
      prisma.roleMenuMessage.findMany({ where: { groupId } }),
    listGroupMessageLocations: (groupId: string) =>
      prisma.roleMenuMessage.findMany({
        where: { groupId },
        select: { channelId: true, messageId: true },
      }),
    createMenuMessage: (data: Prisma.RoleMenuMessageUncheckedCreateInput) =>
      prisma.roleMenuMessage.create({ data }),
    deleteMenuMessage: (id: string) =>
      prisma.roleMenuMessage.delete({ where: { id } }),

    createOption: (data: Prisma.RoleMenuOptionUncheckedCreateInput) =>
      prisma.roleMenuOption.create({ data }),
    deleteOption: (id: string) =>
      prisma.roleMenuOption.delete({ where: { id } }),

    deleteTempRole: (guildId: string, userId: string, roleId: string) =>
      prisma.roleMenuTempRole.deleteMany({
        where: { guildId, userId, roleId },
      }),
    deleteTempRolesForRole: (guildId: string, roleId: string) =>
      prisma.roleMenuTempRole.deleteMany({
        where: { guildId, roleId },
      }),
    deleteTempRolesForRoleIds: (guildId: string, roleIds: readonly string[]) =>
      prisma.roleMenuTempRole.deleteMany({
        where: { guildId, roleId: { in: [...roleIds] } },
      }),
    upsertTempRole: (
      guildId: string,
      userId: string,
      roleId: string,
      expiresAt: Date,
    ) =>
      prisma.roleMenuTempRole.upsert({
        where: {
          guildId_userId_roleId: { guildId, userId, roleId },
        },
        update: { expiresAt },
        create: { guildId, userId, roleId, expiresAt },
      }),
    listExpiredTempRoles: (now: Date) =>
      prisma.roleMenuTempRole.findMany({
        where: { expiresAt: { lte: now } },
        orderBy: { expiresAt: "asc" },
        take: 100,
      }),
    claimExpiredTempRole: (id: string, now: Date) =>
      prisma.roleMenuTempRole.deleteMany({
        where: { id, expiresAt: { lte: now } },
      }),
  };
}
