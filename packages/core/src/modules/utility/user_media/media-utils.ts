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
import { makeErrorCard, makeInfoCard } from "#utilities/cards.js";
import { container } from "@sapphire/framework";
import { capitalizeFirstLetter } from "@sapphire/utilities";

interface MediaRequestContext {
  context: Message | RepliableInteraction;
  targetUser: User;
  mediaType: "avatar" | "banner";
  container: typeof container;
}

export async function handleMediaRequest({
  context,
  targetUser,
  mediaType,
  container,
}: MediaRequestContext) {
  const interactionUser =
    context instanceof Message ? context.author : context.user;
  const { guildId } = context;

  const isButton = context instanceof ButtonInteraction;

  // Cooldown Check
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
      const reply = `Please wait ${timeLeft} more seconds before using this command again.`;

      if (context instanceof Message) {
        const msg = await context.reply({
          ...makeErrorCard("Cooldown", reply),
          allowedMentions: {},
        });
        setTimeout(() => msg.delete().catch(() => {}), 5000);
        return;
      }
      if (context.deferred || context.replied) {
        return context.editReply(makeErrorCard("Cooldown", reply));
      }
      return context.reply({
        ...makeErrorCard("Cooldown", reply),
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

  if (shouldShowMedia) {
    if (mediaType === "avatar" && fetchedUser.avatar) {
      actionRows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel("Avatar Link")
            .setStyle(ButtonStyle.Link)
            .setURL(mediaUrl!),
        ),
      );
    } else if (mediaType === "banner" && fetchedUser.banner) {
      actionRows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel("Banner Link")
            .setStyle(ButtonStyle.Link)
            .setURL(mediaUrl!),
        ),
      );
    }
  } else if (mediaUrl) {
    actionRows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`user-media:view:${fetchedUser.id}:${mediaType}`)
          .setLabel(`View ${capitalizeFirstLetter(mediaType)}`)
          .setStyle(ButtonStyle.Primary),
      ),
    );
  }

  const card = makeInfoCard(`${displayName}'s ${mediaType}`, "", {
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
