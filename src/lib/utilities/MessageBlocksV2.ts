import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle, MessageFlags, SeparatorSpacingSize } from "discord.js";
import {
  clampMessageDocumentV2,
  type MessageBlockButton,
  type MessageDocumentV2,
} from "#src/contracts/Index.ts";
import { parseHexColor } from "#src/lib/utilities/MessageContent.js";
import { renderTemplate } from "#src/lib/utilities/Template.js";
import { resolveCardColor } from "#src/lib/ui/Palette.js";
import type { CardReply } from "#src/lib/ui/Cards.js";

const buttonStyleMap: Record<Exclude<MessageBlockButton["style"], "link">, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

function buildButton(button: MessageBlockButton): ButtonBuilder {
  const b = new ButtonBuilder().setLabel(button.label.slice(0, 80));
  if (button.emoji) b.setEmoji({ name: button.emoji });
  if (button.style === "link") {
    return b.setStyle(ButtonStyle.Link).setURL(button.url ?? "https://discord.com");
  }
  return b
    .setStyle(buttonStyleMap[button.style])
    .setCustomId(button.customId && button.customId.length > 0 ? button.customId : `noop:${button.label}`);
}

export function renderMessageBlocksV2(
  raw: unknown,
  vars: Record<string, string> = {},
): CardReply {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [renderMessageBlocksV2Container(raw, vars)],
    allowedMentions: { parse: [] },
  };
}

export function renderMessageBlocksV2Container(
  raw: unknown,
  vars: Record<string, string> = {},
): ContainerBuilder {
  const doc: MessageDocumentV2 = clampMessageDocumentV2(raw);
  const container = new ContainerBuilder();
  const color = parseHexColor(doc.accentColor) ?? resolveCardColor("info");
  if (color !== undefined) container.setAccentColor(color);

  for (const block of doc.blocks) {
    switch (block.type) {
      case "section": {
        const section = new SectionBuilder();
        for (const text of block.texts) {
          section.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(renderTemplate(text, vars)),
          );
        }
        if (block.accessory?.type === "thumbnail") {
          section.setThumbnailAccessory(new ThumbnailBuilder().setURL(block.accessory.url));
        } else if (block.accessory?.type === "button") {
          section.setButtonAccessory(buildButton(block.accessory.button));
        }
        container.addSectionComponents(section);
        break;
      }
      case "mediaGallery": {
        container.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            ...block.imageUrls.map((url) => new MediaGalleryItemBuilder({ media: { url } })),
          ),
        );
        break;
      }
      case "separator": {
        container.addSeparatorComponents((sep) =>
          sep
            .setSpacing(block.size === "large" ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small)
            .setDivider(block.divider),
        );
        break;
      }
      case "actionRow": {
        container.addActionRowComponents(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            ...block.buttons.map(buildButton),
          ),
        );
        break;
      }
    }
  }

  return container;
}
