import { container } from '@sapphire/framework';
import type { GuildModuleState, Prisma } from '@prisma/client';
import { RedisKeys, RedisTTL } from '../redis.js';

/**
 * Reads the enabled state of a module for a guild.
 */
export async function readModuleState(guildId: string, moduleName: string): Promise<boolean> {
	const cacheKey = RedisKeys.moduleEnabled(moduleName, guildId);
	const cached = await container.redis.get(cacheKey);

	if (cached) {
		return cached === 'true';
	}

	const state = await container.prisma.guildModuleState.findUnique({
		where: { guildId_moduleName: { guildId, moduleName } }
	});

	const enabled = state?.enabled ?? true;
	await container.redis.setex(cacheKey, RedisTTL.moduleEnabledCache, String(enabled));
	return enabled;
}

/**
 * Writes the enabled state of a module for a guild.
 */
export async function writeModuleState(guildId: string, moduleName: string, enabled: boolean): Promise<GuildModuleState> {
	const updated = await container.prisma.guildModuleState.upsert({
		where: { guildId_moduleName: { guildId, moduleName } },
		update: { enabled },
		create: { guildId, moduleName, enabled }
	});

	await container.invalidation.invalidate(RedisKeys.moduleEnabled(moduleName, guildId));
	return updated;
}

/**
 * Reads module dynamic data from the database.
 */
export async function getModuleData<T = unknown>(guildId: string, moduleName: string, targetId: string, key: string): Promise<T | null> {
	const record = await container.prisma.moduleData.findUnique({
		where: {
			guildId_moduleName_targetId_key: {
				guildId,
				moduleName,
				targetId,
				key
			}
		}
	});

	if (!record) return null;
	return record.value as unknown as T;
}

/**
 * Writes module dynamic data to the database.
 */
export async function setModuleData<T = unknown>(guildId: string, moduleName: string, targetId: string, key: string, value: T): Promise<void> {
	await container.prisma.moduleData.upsert({
		where: {
			guildId_moduleName_targetId_key: {
				guildId,
				moduleName,
				targetId,
				key
			}
		},
		update: { value: value as Prisma.InputJsonValue },
		create: {
			guildId,
			moduleName,
			targetId,
			key,
			value: value as Prisma.InputJsonValue
		}
	});
}

export const db = {
	get: getModuleData,
	set: setModuleData
};
