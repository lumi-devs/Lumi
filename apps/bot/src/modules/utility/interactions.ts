import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { LumiServices } from "@lumi/bot-kit";
import { makeCard, makeErrorCard, resolveCardColor } from "@lumi/ui";

export async function handleUtilityInteraction(
  services: LumiServices,
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;
  if (!customId.startsWith("user-media:view:")) return;

  const parts = customId.split(":");
  // user-media:view:<userId>:<type>
  const targetUserId = parts[2];
  const mediaType = parts[3] as "avatar" | "banner" | undefined;

  if (!targetUserId || !mediaType) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => undefined);

  const targetUser = await services.client.users.fetch(targetUserId, { force: true }).catch(() => null);
  if (!targetUser) {
    await interaction.editReply(makeErrorCard("User Not Found", "Could not fetch user information.")).catch(() => undefined);
    return;
  }

  let mediaUrl: string | null = null;
  if (mediaType === "avatar") {
    mediaUrl = targetUser.displayAvatarURL({ size: 4096, extension: "png" });
  } else {
    mediaUrl = targetUser.bannerURL({ size: 4096, extension: "png" }) ?? null;
  }

  if (!mediaUrl) {
    await interaction.editReply(
      makeErrorCard("Not Found", `${targetUser.displayName} does not have a ${mediaType} set.`),
    ).catch(() => undefined);
    return;
  }

  const label = mediaType === "avatar" ? "Avatar Link" : "Banner Link";
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(label)
      .setStyle(ButtonStyle.Link)
      .setURL(mediaUrl)
      .setEmoji({ name: "🖼️" }),
  );

  const gallery = new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder({ media: { url: mediaUrl } }),
  );

  const card = makeCard(
    resolveCardColor("info"),
    `${targetUser.displayName}'s ${mediaType === "avatar" ? "Avatar" : "Banner"}`,
    "",
    {
      mediaGallery: gallery,
      actionRows: [row],
      breadcrumbs: [mediaType === "avatar" ? "Avatar" : "Banner", targetUser.tag || targetUser.username],
    },
  );

  await interaction.editReply(card).catch(() => undefined);
}
