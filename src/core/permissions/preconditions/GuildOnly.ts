import { Precondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, Message } from 'discord.js';

export class GuildOnlyPrecondition extends Precondition {
	public override chatInputRun(interaction: ChatInputCommandInteraction) {
		return interaction.guild ? this.ok() : this.error({ message: 'This command can only be used in a server.' });
	}

	public override messageRun(message: Message) {
		return message.guild ? this.ok() : this.error({ message: 'This command can only be used in a server.' });
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		GuildOnly: never;
	}
}
