import { container } from "@sapphire/framework";
import { MODULE_NAME, TempVcData } from "./keys.js";
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

export async function setGenerator(
  guildId: string,
  channelId: string,
  config: GeneratorConfig,
): Promise<void> {
  await container.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    channelId,
    TempVcData.GENERATOR,
    config,
  );
  await tempVcRegistry.invalidateGenerators(guildId);
}

export async function removeGenerator(
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const count = await container.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    channelId,
    TempVcData.GENERATOR,
  );
  if (count > 0) await tempVcRegistry.invalidateGenerators(guildId);
  return count > 0;
}

export async function listGenerators(
  guildId: string,
): Promise<Map<string, GeneratorConfig>> {
  const rows = await container.db.guildKV.listModuleData<GeneratorConfig>({
    module: MODULE_NAME,
    key: TempVcData.GENERATOR,
    guildId,
  });
  return new Map(rows.map((r) => [r.targetId, r.value]));
}

export function getVcRecord(
  guildId: string,
  channelId: string,
): Promise<VcRecord | null> {
  return container.db.guildKV.getModuleData<VcRecord>(
    guildId,
    MODULE_NAME,
    channelId,
    TempVcData.RECORD,
  );
}

export async function setVcRecord(
  guildId: string,
  channelId: string,
  record: VcRecord,
): Promise<void> {
  await container.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    channelId,
    TempVcData.RECORD,
    record,
  );
  await tempVcRegistry.addVc(guildId, channelId, {
    generatorId: record.generatorId,
    number: record.number,
  });
}

export async function removeVcRecord(
  guildId: string,
  channelId: string,
): Promise<void> {
  await container.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    channelId,
    TempVcData.RECORD,
  );
  await tempVcRegistry.removeVc(guildId, channelId);
}

export async function listVcRecords(
  guildId: string,
): Promise<Map<string, VcRecord>> {
  const rows = await container.db.guildKV.listModuleData<VcRecord>({
    module: MODULE_NAME,
    key: TempVcData.RECORD,
    guildId,
  });
  return new Map(rows.map((r) => [r.targetId, r.value]));
}
