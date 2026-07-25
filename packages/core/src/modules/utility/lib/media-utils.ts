import {
  ButtonStyle,
  ButtonInteraction,
  Message,
  MessageFlags,
  User,
  type RepliableInteraction,
} from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { makeErrorCard, makeInfoCard } from "#lib/utilities/cards.js";
import { container } from "@sapphire/framework";
import { capitalizeFirstLetter } from "@sapphire/utilities";
import { deleteMessageLater } from "#lib/utilities/temporary-message.js";

interface MediaRequestContext {
  context: Message | RepliableInteraction;
  targetUser: User;
  mediaType: "avatar" | "banner";
  container: typeof container;
}

import { fetchT } from "@sapphire/plugin-i18next";
import { LanguageKeys } from "#lib/i18n/keys.js";

export async function handleMediaRequest({
  context,
  targetUser,
  mediaType,
  container,
}: MediaRequestContext) {
  const t = await fetchT(context);
  const interactionUser =
    context instanceof Message ? context.author : context.user;
  const { guildId } = context;

  const isButton = context instanceof ButtonInteraction;

  if (!isButton) {
    const cooldownSeconds =
      ((await container.db.config.getModuleConfig(
        guildId!,
        "user_media",
        "cooldown_seconds",
      )) as number | null) ?? 10;
    const now = Date.now();
    const redisKey = `cooldown:user_media:${interactionUser.id}`;
    const lastUsedStr = await container.redis.get(redisKey);
    const lastUsed = lastUsedStr ? parseInt(lastUsedStr, 10) : 0;

    if (now - lastUsed < cooldownSeconds * 1000) {
      const timeLeft = (
        (lastUsed + cooldownSeconds * 1000 - now) /
        1000
      ).toFixed(1);
      const title = t(LanguageKeys.Commands.MediaCooldownTitle);
      const reply = t(LanguageKeys.Commands.MediaCooldown, { timeLeft });

      if (context instanceof Message) {
        const msg = await context.reply({
          ...makeErrorCard(title, reply),
          allowedMentions: {},
        });
        deleteMessageLater(
          msg,
          undefined,
          "user_media: delete cooldown notice",
        );
        return;
      }
      if (context.deferred || context.replied) {
        return context.editReply(makeErrorCard(title, reply));
      }
      return context.reply({
        ...makeErrorCard(title, reply),
        flags: MessageFlags.Ephemeral,
      });
    }
    await container.redis.set(redisKey, now.toString(), "EX", cooldownSeconds);
  }

  const fetchedUser =
    mediaType === "banner" ? await targetUser.fetch(true) : targetUser;
  const isSelf = interactionUser.id === fetchedUser.id;

  let mediaUrl: string | null | undefined = null;
  const { displayName } = fetchedUser;
  const actionRows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (mediaType === "avatar") {
    mediaUrl = fetchedUser.displayAvatarURL({ size: 4096, extension: "png" });
    if (!fetchedUser.avatar) mediaUrl = null;
  } else {
    mediaUrl = fetchedUser.bannerURL({ size: 4096, extension: "png" });
    if (!fetchedUser.banner) mediaUrl = null;
  }

  const shouldShowMedia = isSelf || isButton;

  if (shouldShowMedia && mediaUrl) {
    actionRows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel(t(LanguageKeys.Commands.MediaLinkBtn, { mediaType: capitalizeFirstLetter(mediaType) }))
          .setStyle(ButtonStyle.Link)
          .setURL(mediaUrl),
      ),
    );
  } else if (mediaUrl) {
    actionRows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`user-media:view:${fetchedUser.id}:${mediaType}`)
          .setLabel(t(LanguageKeys.Commands.MediaViewBtn, { mediaType: capitalizeFirstLetter(mediaType) }))
          .setStyle(ButtonStyle.Primary),
      ),
    );
  }

  const cardTitle = t(LanguageKeys.Commands.MediaCardTitle, { displayName, mediaType: capitalizeFirstLetter(mediaType) });
  const card = makeInfoCard(cardTitle, "", {
    actionRows,
    mediaGallery:
      shouldShowMedia && mediaUrl
        ? new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder({ media: { url: mediaUrl } }),
          )
        : undefined,
  });

  const replyOptions = {
    ...card,
    allowedMentions: {},
    flags: card.flags | (isSelf ? 0 : MessageFlags.Ephemeral),
  };

  if (context instanceof Message) {
    return context.reply(replyOptions);
  }

  if (context.deferred || context.replied) {
    return context.editReply(replyOptions);
  }
  return context.reply(replyOptions);
}
