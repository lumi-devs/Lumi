import { Precondition, type Command } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { RedisKeys, RedisTTL } from '#database/redis.js';
import { readModuleState } from '#database/settings/module.js';

export class ModuleEnabledPrecondition extends Precondition {
	public override async chatInputRun(interaction: ChatInputCommandInteraction, command: Command) {
		if (!interaction.guild) return this.ok();
		return this.#check(interaction.guild.id, command);
	}

	public override async messageRun(message: Message, command: Command) {
		if (!message.guild) return this.ok();
		return this.#check(message.guild.id, command);
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction, command: Command) {
		if (!interaction.guild) return this.ok();
		return this.#check(interaction.guild.id, command);
	}

	async #check(guildId: string, command: Command) {
		const moduleName = this.#getModuleName(command);
		if (!moduleName) return this.ok();

		// ── Global state check ────────────────────────────────────────────────────
		const globalKey = RedisKeys.moduleGlobalEnabled(moduleName);
		const globalCached = await this.container.redis.get(globalKey);
		let globallyEnabled: boolean;
		if (globalCached === null) {
			const settings = await this.container.prisma.globalModuleState.findUnique({ where: { moduleName } });
			globallyEnabled = settings?.enabled ?? true;
			await this.container.redis.setex(globalKey, RedisTTL.moduleEnabledCache, globallyEnabled ? '1' : '0');
		} else {
			globallyEnabled = globalCached !== '0';
		}
		if (!globallyEnabled) return this.error({ message: 'This feature is currently disabled.' });

		// ── Per-guild state check ─────────────────────────────────────────────────
		const enabled = await readModuleState(guildId, moduleName);

		return enabled ? this.ok() : this.error({ message: 'This feature is disabled in this server.' });
	}

	#getModuleName(command: Command): string | null {
		const location = command.location?.full ?? '';
		const match = /modules[/\\]([^/\\]+)[/\\]/.exec(location);
		return match?.[1] ?? null;
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		ModuleEnabled: never;
	}
}
