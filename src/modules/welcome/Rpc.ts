import { container } from "#src/lib/Services.js";
import { welcomeRpc } from "#src/contracts/rpc/Index.ts";
import { Routes } from "discord-api-types/v10";
import { implementRpc } from "#src/lib/rpc/Implement.js";
import {
  fetchChannelRest,
  fetchGuildMemberRest,
  fetchGuildRest,
  GuildTextBasedChannelTypes,
  guildIconUrl,
  memberAvatarUrl,
} from "#src/lib/rpc/DiscordRestLookup.js";
import { serializeCard } from "#src/lib/rpc/CardSerialize.js";
import { logError } from "#src/lib/utilities/Errors.js";
import {
  loadWelcomeConfig,
  renderGoodbyeCard,
  renderWelcomeCard,
  templateVarsFor,
} from "#src/modules/welcome/services/Welcome.js";

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
      GuildTextBasedChannelTypes.has(channel.type);

    const sent = sendable
      ? await container.client.rest
          .post(Routes.channelMessages(channelId), { body: serializeCard(card) })
          .catch((err: unknown) => {
            logError("Welcome: Test send failed", err);
            return null;
          })
      : null;
    if (!sent) {
      throw new Error("Could not send to that channel - check the bot's permissions.");
    }
    return { sent: true };
  },
});
