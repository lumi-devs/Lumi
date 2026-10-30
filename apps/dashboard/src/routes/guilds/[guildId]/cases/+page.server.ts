import type { PageServerLoad } from "./$types";
import { requireGuildAccess } from "$lib/server/auth";
import { getPrisma } from "$lib/server/prisma";

const PageSize = 50;

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);

  const action = (event.url.searchParams.get("action") ?? "")
    .trim()
    .slice(0, 100);
  const userId = (event.url.searchParams.get("userId") ?? "").trim();
  const targetId = (event.url.searchParams.get("targetId") ?? "").trim();
  const pageParam = Number(event.url.searchParams.get("page") ?? "1");
  const page =
    Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  const where = {
    guildId,
    ...(action
      ? { action: { contains: action, mode: "insensitive" as const } }
      : {}),
    ...(/^\d{16,22}$/.test(userId) ? { userId } : {}),
    ...(/^\d{16,22}$/.test(targetId) ? { targetId } : {}),
  };

  const prisma = getPrisma();
  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PageSize,
      take: PageSize,
    }),
  ]);

  return {
    filters: { action, userId, targetId },
    page,
    totalPages: Math.max(1, Math.ceil(total / PageSize)),
    total,
    entries: entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      userId: entry.userId,
      targetId: entry.targetId,
      targetType: entry.targetType,
      changes: entry.changes,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
};
