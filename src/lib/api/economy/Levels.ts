import type { Container } from "#src/lib/Services.js";
import type { LevelBalance } from "#src/modules/leveling/data/LevelRepository.js";
import {
  LevelService,
  type BoardEntry,
  type BoardKind,
} from "#src/modules/leveling/services/LevelService.js";
import { getLevelingConfig } from "#src/modules/leveling/Config.js";

export type { BoardEntry, BoardKind, LevelBalance as LevelAccount };

function service(services: Container): LevelService {
  return new LevelService(services.db.leveling);
}

export async function getAccount(
  services: Container,
  guildId: string,
  userId: string,
): Promise<LevelBalance> {
  return services.db.leveling.ensureAccount(guildId, userId);
}

export async function addXp(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
): Promise<LevelBalance> {
  const config = await getLevelingConfig(services, guildId);
  return service(services).adjustXp(guildId, userId, amount, config);
}

export async function removeXp(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
): Promise<LevelBalance> {
  const config = await getLevelingConfig(services, guildId);
  return service(services).adjustXp(guildId, userId, -amount, config);
}

export async function addLevels(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
): Promise<LevelBalance> {
  const config = await getLevelingConfig(services, guildId);
  return service(services).adjustLevels(guildId, userId, amount, config);
}

export async function removeLevels(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
): Promise<LevelBalance> {
  const config = await getLevelingConfig(services, guildId);
  return service(services).adjustLevels(guildId, userId, -amount, config);
}

export async function setLevel(
  services: Container,
  guildId: string,
  userId: string,
  level: number,
  xp = 0,
): Promise<LevelBalance> {
  const config = await getLevelingConfig(services, guildId);
  return service(services).setLevel(guildId, userId, level, xp, config);
}

export async function getBoard(
  services: Container,
  guildId: string,
  board: BoardKind,
  limit = 10,
  offset = 0,
): Promise<{ entries: BoardEntry[]; total: number }> {
  const config = await getLevelingConfig(services, guildId);
  return service(services).board(guildId, board, config, limit, offset);
}

export async function getRank(
  services: Container,
  guildId: string,
  userId: string,
): Promise<number | null> {
  return service(services).rankOf(guildId, userId);
}
