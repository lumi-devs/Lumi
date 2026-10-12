import type { MessageMentionOptions } from "discord.js";
import type { CardReply } from "#src/lib/ui/Cards.js";

function serializeAllowedMentions(mentions: MessageMentionOptions | undefined) {
  if (!mentions) return undefined;
  return {
    parse: mentions.parse,
    roles: mentions.roles,
    users: mentions.users,
    replied_user: mentions.repliedUser,
  };
}

export function serializeCard(card: CardReply) {
  return {
    flags: card.flags,
    components: card.components.map((component) => component.toJSON()),
    allowed_mentions: serializeAllowedMentions(card.allowedMentions),
  };
}
