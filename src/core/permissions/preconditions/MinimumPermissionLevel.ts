import { Precondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, Message } from 'discord.js';
import { PermissionLevel, PERMISSION_LEVEL_NAMES, resolvePermissionLevel } from '#lib/permissions.js';

export class MinimumPermissionLevelPrecondition extends Precondition {
	public override messageRun(message: Message, _command: never, context: Precondition.Context & { minimumPermissionLevel?: PermissionLevel }) {
		return this.#check(message, context);
	}

	public override chatInputRun(
		interaction: ChatInputCommandInteraction,
		_command: never,
		context: Precondition.Context & { minimumPermissionLevel?: PermissionLevel }
	) {
		return this.#check(interaction, context);
	}

	async #check(ctx: ChatInputCommandInteraction | Message, context: Precondition.Context & { minimumPermissionLevel?: PermissionLevel }) {
		const required = context.minimumPermissionLevel ?? PermissionLevel.USER;
		const actual = await resolvePermissionLevel(ctx, this.container);
		const levelName = PERMISSION_LEVEL_NAMES[required] ?? 'Unknown';
		return actual >= required ? this.ok() : this.error({ message: `You need at least **${levelName}** level to use this.` });
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		MinimumPermissionLevel: {
			minimumPermissionLevel?: PermissionLevel;
		};
	}
}
