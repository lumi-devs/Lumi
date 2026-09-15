import { welcomeRpc } from "@lumi/contracts/rpc";
import { implementRpc } from "#lib/rpc/implement.js";
import {
  loadWelcomeConfig,
  renderGoodbyeCard,
  renderWelcomeCard,
  sendWelcomeCard,
  templateVarsFor,
} from "#lib/utilities/welcome.js";

export const welcomeRpcHandlers = implementRpc(welcomeRpc, {
  "guild.welcome.sendTest": async ({ guild, actorId, input }) => {
    const { kind } = input;
    const config = await loadWelcomeConfig(guild.id);
    const channelId =
      kind === "welcome" ? config.welcomeChannel : config.goodbyeChannel;
    if (!channelId) {
      throw new Error(`Set a ${kind} channel before sending a test message.`);
    }

    const member = await guild.members.fetch(actorId).catch(() => null);
    if (!member) throw new Error("Could not resolve your member in this guild.");

    const vars = templateVarsFor(
      member.id,
      member.user.username,
      member.nickname,
      member.displayAvatarURL(),
      guild.name,
      guild.id,
      guild.iconURL(),
      guild.memberCount,
    );

    const card =
      kind === "welcome"
        ? renderWelcomeCard(config, vars)
        : renderGoodbyeCard(config, vars);
    const sent = await sendWelcomeCard(
      guild,
      channelId,
      card,
      "Welcome: Test send failed",
    );
    if (!sent) {
      throw new Error("Could not send to that channel — check the bot's permissions.");
    }
    return { sent: true };
  },
});
