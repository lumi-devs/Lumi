import { container } from '@sapphire/framework';
import type { Prisma } from '@prisma/client';

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
