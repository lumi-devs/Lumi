import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RpcActions } from "@lumi/contracts";
import { loadWelcomeConfig } from "#modules/welcome/lib/config.js";
import { sendWelcomeCard } from "#modules/welcome/lib/send.js";
import {
  renderGoodbyeCard,
  renderWelcomeCard,
  templateVarsFor,
} from "#modules/welcome/lib/template.js";
import {
  WelcomeSendTestSchema,
  parsePayload,
  verifyGuildAccess,
} from "#lib/rpc/helpers.js";

export function registerWelcomeRpcHandlers(): void {
  registerRpcHandler(RpcActions.guildWelcomeSendTest, async (req) => {
    const { guild, actorId } = await verifyGuildAccess(req);
    const { kind } = parsePayload(WelcomeSendTestSchema, req.data);

    const config = await loadWelcomeConfig(guild.id);
    const channelId = kind === "welcome" ? config.welcomeChannel : config.goodbyeChannel;
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

    const card = kind === "welcome" ? renderWelcomeCard(config, vars) : renderGoodbyeCard(config, vars);
    const sent = await sendWelcomeCard(guild, channelId, card, "Welcome: Test send failed");
    if (!sent) throw new Error("Could not send to that channel — check the bot's permissions.");
    return { sent: true };
  });
}

export function unregisterWelcomeRpcHandlers(): void {
  rpcHandlers.delete(RpcActions.guildWelcomeSendTest);
}
