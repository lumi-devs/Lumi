import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle, MessageFlags, SeparatorSpacingSize } from "discord.js";
import type { TFunction } from "@sapphire/plugin-i18next";
import { EmberColors } from "#utilities/branding.js";
import { EmberEmojis } from "#utilities/assets.js";
import { BotConfig } from "./config.js";
export interface CardOptions {
  footer?: string;
  thumbnail?: string;
  divider?: boolean;
  actionRows?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  mediaGallery?: MediaGalleryBuilder;
}

export interface CardReply {
  readonly flags: number;
  readonly components: ContainerBuilder[];
}

export const ephemeralCard = (card: CardReply): CardReply => ({
  ...card,
  flags: card.flags | MessageFlags.Ephemeral,
});

function buildContainer(
  color: number | null,
  title: string,
  body: string | string[],
  opts: CardOptions = {},
) {
  const c = new ContainerBuilder();
  if (color !== null) {
    c.setAccentColor(color);
  }
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}`),
  );
  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(opts.divider ?? true),
  );

  const parts = Array.isArray(body) ? body : [body];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i > 0)
      c.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true),
      );
    if (part && part.length > 0) {
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(part));
    }
  }

  if (opts.footer) {
    c.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(false),
    );
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${opts.footer}`),
    );
  }
  if (opts.mediaGallery) {
    c.addMediaGalleryComponents(opts.mediaGallery);
  }
  for (const row of opts.actionRows ?? []) {
    c.addActionRowComponents((builder) => {
      builder.addComponents(...row.components);
      return builder;
    });
  }
  return c;
}

const wrap = (c: ContainerBuilder): CardReply => ({
  flags: MessageFlags.IsComponentsV2 as number,
  components: [c],
});

export const makeSuccessCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(EmberColors.SUCCESS, title, body, opts));
export const makeErrorCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(EmberColors.ERROR, title, body, opts));
export const makeWarningCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(EmberColors.WARNING, title, body, opts));
export const makeInfoCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(null, title, body, opts));
export const makeCard = (
  color: number,
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(color, title, body, opts));

export function makeFieldsCard(
  title: string,
  fields: { name: string; value: string }[],
  opts?: CardOptions,
) {
  return wrap(
    buildContainer(
      EmberColors.PRIMARY,
      title,
      fields.map((f) => `**${f.name}**: ${f.value}`).join("\n"),
      opts,
    ),
  );
}

export function makeListCard(
  t: TFunction,
  title: string,
  items: string[],
  page = 0,
  perPage = BotConfig.ui.defaultListPerPage,
  customIdPrefix?: string,
) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const slice = items.slice(page * perPage, (page + 1) * perPage);
  const body = slice.length ? slice.join("\n") : t("system:LIST_EMPTY");
  const footer =
    totalPages > 1
      ? t("system:LIST_FOOTER_PAGES", {
          page: page + 1,
          totalPages,
          items: items.length,
        })
      : t("system:LIST_FOOTER_ITEMS", { items: items.length });

  const c = buildContainer(EmberColors.PRIMARY, title, body, { footer });

  if (customIdPrefix && totalPages > 1) {
    c.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${customIdPrefix}:prev:${page}`)
          .setLabel(t("system:BTN_PREV"))
          .setEmoji({ name: EmberEmojis.ARROW_LEFT })
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 0),
        new ButtonBuilder()
          .setCustomId(`${customIdPrefix}:next:${page}`)
          .setLabel(t("system:BTN_NEXT"))
          .setEmoji({ name: EmberEmojis.ARROW_RIGHT })
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1),
      ),
    );
  }

  return wrap(c);
}
