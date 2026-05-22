import { container } from '@sapphire/framework';
import type { Guild, GuildModuleState, GuildModuleConfig, Prisma } from '@prisma/client';
import { RedisKeys, RedisTTL } from '#lib/redis.js';

export type ReadonlyGuildData = Readonly<Guild>;

/**
 * Checks if the dashboard integration is enabled for a guild.
 */
export async function isDashboardEnabled(guildId: string): Promise<boolean> {
	const value = await readModuleConfig(guildId, 'core', 'dashboard_enabled');
	return value === undefined || value === null ? true : Boolean(value);
}

/**
 * Reads settings for a guild from Redis cache or Postgres database.
 * Provides unified settings access.
 */
export async function readSettings(guildId: string): Promise<ReadonlyGuildData> {
	const cacheKey = RedisKeys.guildSettings(guildId);
	const cached = await container.redis.get(cacheKey);

	if (cached) {
		return JSON.parse(cached) as Guild;
	}

	let settings = await container.prisma.guild.findUnique({
		where: { id: guildId }
	});

	if (!settings) {
		settings = await container.prisma.guild.create({
			data: { id: guildId }
		});
	}

	await container.redis.setex(cacheKey, RedisTTL.guildConfig, JSON.stringify(settings));
	return settings;
}

/**
 * Writes settings for a guild to Postgres and invalidates the Redis cache.
 */
export async function writeSettings(guildId: string, data: Partial<Omit<Guild, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ReadonlyGuildData> {
	const updated = await container.prisma.guild.update({
		where: { id: guildId },
		data
	});

	await container.invalidation.invalidate(RedisKeys.guildSettings(guildId), RedisKeys.guildPrefixes(guildId));

	return updated;
}

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
 * Reads a module configuration value.
 */
export async function readModuleConfig(guildId: string, moduleName: string, key: string): Promise<any> {
	const cacheKey = RedisKeys.guildConfig(moduleName, guildId);
	const cached = await container.redis.get(cacheKey);

	if (cached) {
		const configMap = JSON.parse(cached) as Record<string, any>;
		return configMap[key];
	}

	// Fetch all for this module to populate the cache map
	const configs = await container.prisma.guildModuleConfig.findMany({
		where: { guildId, moduleName }
	});

	const configMap: Record<string, any> = {};
	for (const cfg of configs) {
		configMap[cfg.configKey] = cfg.value;
	}

	await container.redis.setex(cacheKey, RedisTTL.guildConfig, JSON.stringify(configMap));
	return configMap[key];
}

/**
 * Writes a module configuration value.
 */
export async function writeModuleConfig(guildId: string, moduleName: string, key: string, value: Prisma.InputJsonValue): Promise<GuildModuleConfig> {
	const updated = await container.prisma.guildModuleConfig.upsert({
		where: { guildId_moduleName_configKey: { guildId, moduleName, configKey: key } },
		update: { value },
		create: { guildId, moduleName, configKey: key, value }
	});

	await container.invalidation.invalidate(RedisKeys.guildConfig(moduleName, guildId));
	return updated;
}
