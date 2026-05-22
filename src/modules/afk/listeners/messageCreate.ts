import { Listener, Events } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Message, PermissionsBitField } from 'discord.js';
import { EmberColors } from '#lib/branding.js';
import { makeCard, makeWarningCard } from '#lib/cards.js';
import { RedisKeys } from '#lib/redis.js';
import {
	AFK_MENTION_COOLDOWN_MS,
	AFK_NICK_EDIT_COOLDOWN_MS,
	AFK_WELCOME_COOLDOWN_MS,
	NICK_PREFIX,
	afkDurationSince,
	armCooldown,
	clearAfkMentions,
	getAfk,
	getAfkMentions,
	isAfkEnabled,
	isCooldownActive,
	recordAfkMention,
	removeAfk,
	sanitizeReason
} from '../index.js';

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class AFKMessageCreateListener extends Listener<typeof Events.MessageCreate> {
	public async run(message: Message): Promise<void> {
		if (!message.inGuild() || message.author.bot) return;
		if (!(await isAfkEnabled(message.guildId))) return;

		const ownEntry = await getAfk(message.guildId, message.author.id);
		if (ownEntry) {
			const onCooldown = await isCooldownActive(RedisKeys.afkRemovalCooldown(message.guildId, message.author.id));
			if (!onCooldown) await this.#removeAfk(message, ownEntry.since);
		}

		if (message.mentions.users.size > 0) await this.#notifyMentioned(message);
	}

	async #removeAfk(message: Message<true>, since: Date): Promise<void> {
		const { guildId, channelId } = message;
		const userId = message.author.id;

		// Snapshot mentions BEFORE clearing so the welcome-back button has data.
		const mentions = await getAfkMentions(guildId, userId);
		await removeAfk(guildId, userId).catch(() => undefined);

		const { member } = message;
		if (member && member.displayName.startsWith(NICK_PREFIX)) {
			const newNick = member.displayName.slice(NICK_PREFIX.length).trim();
			void this.#editNick(userId, () => member.setNickname(newNick || null));
		}

		const welcomeKey = RedisKeys.afkWelcomeCooldown(channelId);
		if (await isCooldownActive(welcomeKey)) return;
		await armCooldown(welcomeKey, AFK_WELCOME_COOLDOWN_MS);

		if (!message.channel.isSendable() || !this.#canSpeak(message)) return;

		const actionRows = mentions.length
			? [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setCustomId(`afk:mentions:${guildId}:${userId}`)
							.setLabel(`View Mentions (${mentions.length})`)
							.setEmoji('📬')
							.setStyle(ButtonStyle.Secondary)
					)
				]
			: undefined;

		const sent = await message.channel
			.send({
				...makeWarningCard(
					'👋 Welcome Back!',
					`${message.author.toString()}, AFK removed.\nYou were AFK for **${afkDurationSince(since)}**.`,
					{ actionRows }
				),
				allowedMentions: { parse: [] }
			})
			.catch(() => null);
		// Keep mentions in Redis until the welcome-back card self-deletes — gives the
		// button time to be useful. After that the natural 24h TTL takes over.
		if (sent) {
			setTimeout(() => {
				void sent.delete().catch(() => null);
				void clearAfkMentions(guildId, userId).catch(() => undefined);
			}, 20_000);
		} else {
			await clearAfkMentions(guildId, userId).catch(() => undefined);
		}
	}

	async #notifyMentioned(message: Message<true>): Promise<void> {
		const mentionKey = RedisKeys.afkMentionCooldown(message.channelId);
		const channelOnCooldown = await isCooldownActive(mentionKey);
		let firstNotified = false;

		// Iterate every mentioned AFK user. Always record the mention (for the button),
		// only post one channel notification per cooldown window.
		for (const mentioned of message.mentions.users.values()) {
			if (mentioned.id === message.author.id) continue;
			const entry = await getAfk(message.guildId, mentioned.id);
			if (!entry) continue;

			await recordAfkMention(message.guildId, mentioned.id, {
				authorId: message.author.id,
				authorName: message.member?.displayName ?? message.author.username,
				channelId: message.channelId,
				messageId: message.id,
				ts: Math.floor(message.createdTimestamp / 1000)
			});

			if (firstNotified || channelOnCooldown) continue;

			const displayName = (await message.guild.members.fetch(mentioned.id).catch(() => null))?.displayName ?? mentioned.username;
			const cleanName = displayName.startsWith(NICK_PREFIX) ? displayName.slice(NICK_PREFIX.length) : displayName;

			if (!message.channel.isSendable() || !this.#canSpeak(message)) continue;
			const sent = await message
				.reply({
					...makeCard(
						EmberColors.GOLD,
						`${cleanName} is AFK 💤`,
						`**Reason:** ${sanitizeReason(entry.reason)}\n**AFK for:** ${afkDurationSince(entry.since)}`
					),
					allowedMentions: { repliedUser: true }
				})
				.catch(() => null);
			if (sent) setTimeout(() => sent.delete().catch(() => null), 600_000);
			await armCooldown(mentionKey, AFK_MENTION_COOLDOWN_MS);
			firstNotified = true;
		}
	}

	#canSpeak(message: Message<true>): boolean {
		const { me } = message.guild.members;
		if (!me) return false;
		const { channel } = message;
		if (!('permissionsFor' in channel)) return true;
		return channel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages) ?? false;
	}

	async #editNick(userId: string, fn: () => Promise<unknown>): Promise<void> {
		const key = RedisKeys.afkNickEditCooldown(userId);
		if (await isCooldownActive(key)) return;
		await armCooldown(key, AFK_NICK_EDIT_COOLDOWN_MS);
		await fn().catch(() => undefined);
	}
}
