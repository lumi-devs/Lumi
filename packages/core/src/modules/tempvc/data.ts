import { container } from "@sapphire/framework";
import type { TempVcRecord } from "@prisma/client";
import { tempVcRegistry } from "./registry.js";

export interface GeneratorConfig {
  /** Name template; use {} where the number goes, e.g. "Gaming {}" → "Gaming 1". */
  name: string;
  /** User limit applied to created channels (0 = unlimited). */
  limit: number;
}

export interface VcRecord {
  ownerId: string;
  generatorId: string;
  name: string;
  number: number;
  locked: boolean;
  hidden: boolean;
  createdAt: number;
}

function toRecord(row: TempVcRecord): VcRecord {
  return {
    ownerId: row.ownerId,
    generatorId: row.generatorId,
    name: row.name,
    number: row.number,
    locked: row.locked,
    hidden: row.hidden,
    createdAt: row.createdAt.getTime(),
  };
}

export async function setGenerator(
  guildId: string,
  channelId: string,
  config: GeneratorConfig,
): Promise<void> {
  await container.db.tempvc.upsertGenerator(guildId, channelId, config);
  await tempVcRegistry.invalidateGenerators(guildId);
}

export async function removeGenerator(
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const removed = await container.db.tempvc.deleteGenerator(guildId, channelId);
  if (removed) await tempVcRegistry.invalidateGenerators(guildId);
  return removed;
}

export async function listGenerators(
  guildId: string,
): Promise<Map<string, GeneratorConfig>> {
  const rows = await container.db.tempvc.listGenerators(guildId);
  return new Map(
    rows.map((r) => [r.channelId, { name: r.name, limit: r.limit }]),
  );
}

export async function getVcRecord(
  guildId: string,
  channelId: string,
): Promise<VcRecord | null> {
  const row = await container.db.tempvc.getRecord(guildId, channelId);
  return row ? toRecord(row) : null;
}

export async function setVcRecord(
  guildId: string,
  channelId: string,
  record: VcRecord,
): Promise<void> {
  await container.db.tempvc.upsertRecord(guildId, channelId, {
    ownerId: record.ownerId,
    generatorId: record.generatorId,
    name: record.name,
    number: record.number,
    locked: record.locked,
    hidden: record.hidden,
  });
  await tempVcRegistry.addVc(guildId, channelId, {
    generatorId: record.generatorId,
    number: record.number,
  });
}

/**
 * Apply a partial update to an existing record and return the merged result.
 * Returns null when the record is gone (channel deleted mid-interaction).
 */
export async function patchVcRecord(
  guildId: string,
  channelId: string,
  patch: Partial<Omit<VcRecord, "createdAt">>,
): Promise<VcRecord | null> {
  const row = await container.db.tempvc.patchRecord(guildId, channelId, patch);
  if (!row) return null;
  const record = toRecord(row);
  await tempVcRegistry.addVc(guildId, channelId, {
    generatorId: record.generatorId,
    number: record.number,
  });
  return record;
}

export async function removeVcRecord(
  guildId: string,
  channelId: string,
): Promise<void> {
  await container.db.tempvc.deleteRecord(guildId, channelId);
  await tempVcRegistry.removeVc(guildId, channelId);
}

export async function listVcRecords(
  guildId: string,
): Promise<Map<string, VcRecord>> {
  const rows = await container.db.tempvc.listRecords(guildId);
  return new Map(rows.map((r) => [r.channelId, toRecord(r)]));
}
