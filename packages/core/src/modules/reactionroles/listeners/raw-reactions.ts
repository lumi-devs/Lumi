import { Listener } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { GatewayDispatchPayload } from "discord-api-types/v10";
import { logError } from "#lib/utilities/errors.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { planToggle } from "#modules/reactionroles/data.js";
import type ReactionRolesUtility from "#modules/reactionroles/utilities/ReactionRolesUtility.js";

interface ReactionPacket {
  user_id: string;
  message_id: string;
  channel_id: string;
  guild_id?: string;
  emoji: { id: string | null; name: string | null };
  member?: { user?: { bot?: boolean } };
}

@ApplyOptions<Listener.Options>({
  name: "reactionrolesRawReactions",
  event: "raw",
})
export default class ReactionRolesRawReactionsListener extends Listener {
  private get service(): ReactionRolesUtility {
    return getUtility("reactionroles");
  }

  public async run(packet: GatewayDispatchPayload): Promise<void> {
    if (packet.t !== "MESSAGE_REACTION_ADD" && packet.t !== "MESSAGE_REACTION_REMOVE") {
      return;
    }
    const data = packet.d as ReactionPacket;
    if (!data.guild_id) return;
    if (data.user_id === this.container.client.user?.id) return;
    if (data.member?.user?.bot === true) return;

    const guildId = data.guild_id;
    if (!(await isModuleEnabled(guildId, "reactionroles").catch(() => false))) {
      return;
    }
    const menu = await this.service
      .findMenuByMessage(guildId, data.message_id)
      .catch((err: unknown) => {
        logError("ReactionRoles: reaction menu lookup failed", err);
        return null;
      });
    if (!menu || menu.mode !== "reactions") return;

    const guild = this.container.client.guilds.cache.get(guildId);
    if (!guild) return;
    const member = await guild.members.fetch(data.user_id).catch(() => null);
    if (!member || member.user.bot) return;

    const optionId = await this.service
      .optionIdForEmoji(guildId, menu.id, data.emoji.id, data.emoji.name)
      .catch(() => null);
    if (!optionId) return;
    const option = menu.options.find((o) => o.id === optionId);
    if (!option) return;

    try {
      if (packet.t === "MESSAGE_REACTION_ADD") {
        const plan = planToggle({
          menu,
          optionId,
          memberRoleIds: [...member.roles.cache.keys()],
        });
        if (plan.outcome !== "add") {
          await this.removeUserReaction(guildId, data, option.emoji);
          return;
        }
        if (plan.removeRoleIds.length > 0) {
          await member.roles
            .remove(plan.removeRoleIds, "Reaction role exclusive swap")
            .catch((err: unknown) =>
              logError("ReactionRoles: exclusive cleanup failed", err),
            );
        }
        await member.roles.add(plan.roleId, "Reaction role claim").catch((err: unknown) => {
          logError("ReactionRoles: reaction role add failed", err);
          throw err;
        });
      } else {
        if (!member.roles.cache.has(option.roleId)) return;
        await member.roles.remove(option.roleId, "Reaction role unclaim").catch((err: unknown) => {
          logError("ReactionRoles: reaction role remove failed", err);
        });
      }
    } catch {
      await this.removeUserReaction(guildId, data, option.emoji).catch(() => null);
    }
  }

  private async removeUserReaction(
    guildId: string,
    data: ReactionPacket,
    emojiText: string | null,
  ): Promise<void> {
    const guild = this.container.client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = await guild.channels.fetch(data.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const message = await channel.messages.fetch(data.message_id).catch(() => null);
    if (!message) return;
    const identifier = data.emoji.id ?? data.emoji.name ?? emojiText ?? undefined;
    if (!identifier) return;
    const reaction = message.reactions.cache.get(
      data.emoji.id ?? `${data.emoji.name}`,
    );
    if (reaction) {
      await reaction.users.remove(data.user_id).catch(() => null);
      return;
    }
    await message.reactions
      .resolve(identifier)
      ?.users.remove(data.user_id)
      .catch(() => null);
  }
}
