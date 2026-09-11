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
} from "@lumi/contracts";
import { parseHexColor } from "#lib/message-content.js";
import { renderTemplate } from "./template.js";
import { resolveCardColor } from "./config.js";
import type { CardReply } from "./ui/types.js";

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

/**
 * Renders a `MessageDocumentV2` (the dashboard's block builder output) into a
 * real Components V2 payload, the same primitives `cards.ts`'s
 * `buildContainer` uses (`ContainerBuilder`/`SectionBuilder`/
 * `TextDisplayBuilder`/`MediaGalleryBuilder`/`SeparatorBuilder`/
 * `ThumbnailBuilder`), so this is a second entry point into the same
 * rendering primitives rather than a parallel system. `vars` is the
 * module's own template-variable context (welcome, sticky, ...); text
 * bodies and button labels are run through `renderTemplate` the same way
 * plain-template fields are.
 */
export function renderMessageBlocksV2(
  raw: unknown,
  vars: Record<string, string> = {},
): CardReply {
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

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}
