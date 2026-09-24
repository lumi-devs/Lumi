import { container } from "@sapphire/framework";
import { welcomeRpc } from "@lumi/contracts/rpc";
import { ChannelType, type MessageMentionOptions } from "discord.js";
import { Routes } from "discord-api-types/v10";
import { implementRpc } from "#lib/rpc/implement.js";
import {
  fetchChannelRest,
  fetchGuildMemberRest,
  fetchGuildRest,
  guildIconUrl,
  memberAvatarUrl,
} from "#lib/rpc/discord-rest-lookup.js";
import { logError } from "#lib/utilities/errors.js";
import type { CardReply } from "#lib/ui/cards.js";
import {
  loadWelcomeConfig,
  renderGoodbyeCard,
  renderWelcomeCard,
  templateVarsFor,
} from "./services/welcome.js";

/** Matches discord.js's own `GuildTextBasedChannelTypes` - the channel types a message can be sent to. */
const SendableChannelTypes = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
]);

function serializeAllowedMentions(mentions: MessageMentionOptions | undefined) {
  if (!mentions) return undefined;
  return {
    parse: mentions.parse,
    roles: mentions.roles,
    users: mentions.users,
    replied_user: mentions.repliedUser,
  };
}

/** discord.js's `channel.send(card)` resolves builder instances to plain JSON itself; a raw REST post has to do that conversion here. */
function serializeCard(card: CardReply) {
  return {
    flags: card.flags,
    components: card.components.map((component) => component.toJSON()),
    allowed_mentions: serializeAllowedMentions(card.allowedMentions),
  };
}

export const welcomeRpcHandlers = implementRpc(welcomeRpc, {
  "guild.welcome.sendTest": async ({ guildId, actorId, input }) => {
    const { kind } = input;
    const config = await loadWelcomeConfig(guildId);
    const channelId =
      kind === "welcome" ? config.welcomeChannel : config.goodbyeChannel;
    if (!channelId) {
      throw new Error(`Set a ${kind} channel before sending a test message.`);
    }

    const guildData = await fetchGuildRest(guildId);
    if (!guildData) throw new Error("Guild not found in bot cache");

    const member = await fetchGuildMemberRest(guildId, actorId);
    if (!member) throw new Error("Could not resolve your member in this guild.");

    const vars = templateVarsFor(
      member.user.id,
      member.user.username,
      member.nick ?? null,
      memberAvatarUrl(guildId, member),
      guildData.name,
      guildId,
      guildIconUrl(guildData),
      guildData.approximate_member_count ?? 0,
    );

    const card =
      kind === "welcome"
        ? renderWelcomeCard(config, vars)
        : renderGoodbyeCard(config, vars);

    const channel = await fetchChannelRest(channelId);
    const sendable =
      channel !== null &&
      "guild_id" in channel &&
      channel.guild_id === guildId &&
      SendableChannelTypes.has(channel.type);

    const sent = sendable
      ? await container.client.rest
          .post(Routes.channelMessages(channelId), { body: serializeCard(card) })
          .catch((err: unknown) => {
            logError("Welcome: Test send failed", err);
            return null;
          })
      : null;
    if (!sent) {
      throw new Error("Could not send to that channel — check the bot's permissions.");
    }
    return { sent: true };
  },
});
