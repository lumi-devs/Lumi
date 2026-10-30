import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma";

export async function recordAudit(input: {
  guildId: string;
  userId: string;
  action: string;
  targetId?: string | null;
  targetType?: string | null;
  changes?: Prisma.InputJsonValue | null;
}): Promise<void> {
  try {
    await getPrisma().auditLog.create({
      data: {
        guildId: input.guildId,
        userId: input.userId,
        action: input.action,
        targetId: input.targetId ?? null,
        targetType: input.targetType ?? null,
        ...(input.changes == null ? {} : { changes: input.changes }),
      },
    });
  } catch (error) {
    console.error("[dashboard] audit write failed", error);
  }
}
