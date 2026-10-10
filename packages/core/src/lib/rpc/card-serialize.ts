import type { MessageMentionOptions } from "discord.js";
import type { CardReply } from "@lumi/lib/ui/cards.js";

function serializeAllowedMentions(mentions: MessageMentionOptions | undefined) {
  if (!mentions) return undefined;
  return {
    parse: mentions.parse,
    roles: mentions.roles,
    users: mentions.users,
    replied_user: mentions.repliedUser,
  };
}

/**
 * discord.js's `channel.send(card)`/`message.edit(card)` resolve builder
 * instances (and camelCase `allowedMentions`) to the raw API's JSON shape
 * themselves; a raw REST call has to do that conversion here. Shared by every
 * RPC handler that posts/edits a `CardReply` directly via
 * `container.client.rest` instead of a gateway-cached channel/message.
 */
export function serializeCard(card: CardReply) {
  return {
    flags: card.flags,
    components: card.components.map((component) => component.toJSON()),
    allowed_mentions: serializeAllowedMentions(card.allowedMentions),
  };
}
