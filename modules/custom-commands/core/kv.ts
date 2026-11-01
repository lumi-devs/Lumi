import type { ModuleServices } from "@lumi/module-kit";
import { Limits, type CustomCommandKvRow, type KvAdapter } from "./types.js";

function prismaOf(services: ModuleServices): any {
  return services.db?.prisma ?? (services as { prisma?: any }).prisma;
}

function validateKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0) throw new Error("KV key is required.");
  if (trimmed.length > Limits.keyLength) {
    throw new Error(`KV keys are limited to ${Limits.keyLength} characters.`);
  }
  return trimmed;
}

function serializeValue(value: unknown): unknown {
  let serialized: string;
  try {
    serialized = JSON.stringify(value ?? null);
  } catch {
    throw new Error("KV value must be JSON-serializable.");
  }
  if (new TextEncoder().encode(serialized).byteLength > Limits.valueBytes) {
    throw new Error(`KV values are limited to ${Limits.valueBytes} bytes.`);
  }
  return value ?? null;
}

function validateTtl(ttlSeconds: number | undefined): number | null {
  if (ttlSeconds === undefined) return null;
  if (!Number.isFinite(ttlSeconds)) throw new Error("KV TTL must be a number.");
  const ttl = Math.floor(ttlSeconds);
  if (ttl <= 0) return null;
  if (ttl > Limits.kvTtlMaxSeconds) {
    throw new Error(`KV TTL cannot exceed ${Limits.kvTtlMaxSeconds} seconds.`);
  }
  return ttl;
}

function expiryDate(ttlSeconds: number | undefined): Date | null {
  const ttl = validateTtl(ttlSeconds);
  return ttl === null ? null : new Date(Date.now() + ttl * 1_000);
}

function isExpired(row: { expiresAt: Date | null }): boolean {
  return row.expiresAt !== null && row.expiresAt.getTime() <= Date.now();
}

export async function getKv(
  services: ModuleServices,
  guildId: string,
  userId: string,
  key: string,
): Promise<unknown> {
  const prisma = prismaOf(services);
  const row = (await prisma.customCommandKv.findUnique({
    where: { guildId_userId_key: { guildId, userId, key: validateKey(key) } },
  })) as CustomCommandKvRow | null;
  if (!row) return null;
  if (isExpired(row)) {
    await prisma.customCommandKv.deleteMany({
      where: { guildId, userId, key: row.key },
    });
    return null;
  }
  return row.value;
}

async function writeKv(
  services: ModuleServices,
  guildId: string,
  userId: string,
  key: string,
  value: unknown,
  expiresAt: Date | null,
): Promise<void> {
  const prisma = prismaOf(services);
  const existing = (await prisma.customCommandKv.findUnique({
    where: { guildId_userId_key: { guildId, userId, key } },
    select: { id: true },
  })) as { id: string } | null;

  if (!existing) {
    const count = await prisma.customCommandKv.count({
      where: { guildId, userId },
    });
    if (count >= Limits.kvKeysPerUser) {
      throw new Error(
        `A user may store at most ${Limits.kvKeysPerUser} KV keys.`,
      );
    }
  }

  await prisma.customCommandKv.upsert({
    where: { guildId_userId_key: { guildId, userId, key } },
    update: { value, expiresAt },
    create: { guildId, userId, key, value, expiresAt },
  });
}

export async function setKv(
  services: ModuleServices,
  guildId: string,
  userId: string,
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<unknown> {
  const normalizedKey = validateKey(key);
  const normalizedValue = serializeValue(value);
  await writeKv(
    services,
    guildId,
    userId,
    normalizedKey,
    normalizedValue,
    expiryDate(ttlSeconds),
  );
  return normalizedValue;
}

export async function incrKv(
  services: ModuleServices,
  guildId: string,
  userId: string,
  key: string,
  by = 1,
): Promise<number> {
  const prisma = prismaOf(services);
  const normalizedKey = validateKey(key);
  const normalizedBy = Number(by);
  if (!Number.isFinite(normalizedBy))
    throw new Error("KV increment must be a number.");

  const row = (await prisma.customCommandKv.findUnique({
    where: {
      guildId_userId_key: {
        guildId,
        userId,
        key: normalizedKey,
      },
    },
  })) as CustomCommandKvRow | null;

  const current =
    row && !isExpired(row) && typeof row.value === "number"
      ? row.value
      : row && !isExpired(row) && Number.isFinite(Number(row.value))
        ? Number(row.value)
        : 0;
  const next = current + normalizedBy;
  const expiresAt = row && !isExpired(row) ? row.expiresAt : null;

  await writeKv(
    services,
    guildId,
    userId,
    normalizedKey,
    serializeValue(next),
    expiresAt,
  );
  return next;
}

export async function delKv(
  services: ModuleServices,
  guildId: string,
  userId: string,
  key: string,
): Promise<boolean> {
  const prisma = prismaOf(services);
  const result = await prisma.customCommandKv.deleteMany({
    where: { guildId, userId, key: validateKey(key) },
  });
  return result.count > 0;
}

export interface KvListEntry {
  key: string;
  value: unknown;
  expiresAt: Date | null;
  updatedAt: Date;
}

export async function listKv(
  services: ModuleServices,
  guildId: string,
  userId: string,
  limit = 50,
): Promise<KvListEntry[]> {
  const prisma = prismaOf(services);
  const rows = (await prisma.customCommandKv.findMany({
    where: {
      guildId,
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(1, limit), 100),
  })) as CustomCommandKvRow[];
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  }));
}

export async function clearExpiredKv(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  const prisma = prismaOf(services);
  const result = await prisma.customCommandKv.deleteMany({
    where: { guildId, expiresAt: { lte: new Date() } },
  });
  return result.count;
}

export function createKvAdapter(
  services: ModuleServices,
  guildId: string,
  userId: string,
  maxOps: number = Limits.kvOpsPerRun,
): KvAdapter {
  let operations = 0;
  const count = (): void => {
    operations += 1;
    if (operations > maxOps) {
      throw new Error(`KV operations exceeded the ${maxOps} per-run limit.`);
    }
  };

  return {
    async get(key) {
      count();
      return getKv(services, guildId, userId, key);
    },
    async set(key, value, ttlSeconds) {
      count();
      return setKv(services, guildId, userId, key, value, ttlSeconds);
    },
    async incr(key, by) {
      count();
      return incrKv(services, guildId, userId, key, by);
    },
    async del(key) {
      count();
      return delKv(services, guildId, userId, key);
    },
  };
}
