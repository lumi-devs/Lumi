import type { PrismaClient } from "@prisma/client";

export type PermitDelegateSource = Pick<PrismaClient, "permit">;

export function isUniqueConstraintError(error: unknown): boolean {
  return hasPrismaCode(error, "P2002");
}

export function isRecordNotFoundError(error: unknown): boolean {
  return hasPrismaCode(error, "P2025");
}

export function isPermitNumberConflict(error: unknown): boolean {
  if (!hasPrismaCode(error, "P2002")) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return target.includes("number");
  return typeof target === "string" && target.includes("number");
}

function hasPrismaCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === code;
}





export async function nextPermitNumber(
  db: PermitDelegateSource,
  guildId: string,
): Promise<number> {
  const permits = await db.permit.findMany({
    where: { guildId },
    select: { number: true },
    orderBy: { number: "asc" },
  });

  let number = 1;
  for (const permit of permits) {
    if (permit.number === number) number += 1;
    else if (permit.number > number) break;
  }
  return number;
}
