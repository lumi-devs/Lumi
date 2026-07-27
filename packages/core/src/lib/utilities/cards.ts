import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  MessageFlags,
  SeparatorSpacingSize,
  type MessageMentionOptions,
} from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";
import { BotConfig } from "./config.js";

/** Standard palette of UI accent colors for SaaS cards and panels. */
export const CARD_ACCENTS = {
  PRIMARY: 0x5865f2,
  INFO: 0x3498db,
  SUCCESS: 0x2ecc71,
  WARNING: 0xf1c40f,
  ERROR: 0xe74c3c,
  PURPLE: 0x9b59b6,
  CYAN: 0x1abc9c,
} as const;

export function formatStatusBadge(status: string, label?: string): string {
  const normalized = status.toLowerCase();
  let icon = "⚪";
  switch (normalized) {
    case "online":
    case "success":
    case "enabled":
    case "active":
      icon = "🟢";
      break;
    case "idle":
    case "warning":
    case "pending":
      icon = "🟡";
      break;
    case "dnd":
    case "error":
    case "disabled":
    case "failed":
      icon = "🔴";
      break;
    case "offline":
    case "inactive":
      icon = "⚪";
      break;
    default:
      icon = "🔘";
      break;
  }
  const text = label ?? status.toUpperCase();
  return `${icon} \`${text}\``;
}

export const makeStatusBadge = formatStatusBadge;

export function formatSubtitle(text: string, icon?: string): string {
  const formatted = icon ? `${icon} ${text}` : text;
  return `-# ${formatted}`;
}

export function formatBreadcrumbs(crumbs: string[], separator = " ❯ "): string {
  if (!crumbs || crumbs.length === 0) return "";
  return crumbs
    .map((crumb, idx) =>
      idx === crumbs.length - 1 ? `**${crumb}**` : `\`${crumb}\``,
    )
    .join(separator);
}

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
  readonly allowedMentions?: MessageMentionOptions;
}

export const ephemeralCard = (card: CardReply): CardReply => ({
  ...card,
  flags: card.flags | MessageFlags.Ephemeral,
});

/** Renders mentions as text without pinging anyone. */
export const noPingCard = (card: CardReply): CardReply => ({
  ...card,
  allowedMentions: { parse: [] },
});

const smallSeparator = (divider: boolean): SeparatorBuilder =>
  new SeparatorBuilder()
    .setSpacing(SeparatorSpacingSize.Small)
    .setDivider(divider);

function buildContainer(
  title: string,
  body: string | string[],
  opts: CardOptions = {},
  accentColor?: number,
) {
  const c = new ContainerBuilder();
  if (accentColor) {
    c.setAccentColor(accentColor);
  }
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}`),
  );
  c.addSeparatorComponents(smallSeparator(opts.divider ?? true));

  const parts = Array.isArray(body) ? body : [body];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i > 0) c.addSeparatorComponents(smallSeparator(true));
    if (part && part.length > 0) {
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(part));
    }
  }

  if (opts.footer) {
    c.addSeparatorComponents(smallSeparator(false));
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
  flags: MessageFlags.IsComponentsV2,
  components: [c],
  allowedMentions: { parse: [] },
});

export const makeSuccessCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(title, body, opts, BotConfig.branding.colors.SUCCESS));
export const makeErrorCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(title, body, opts, BotConfig.branding.colors.ERROR));
export const makeWarningCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(title, body, opts, BotConfig.branding.colors.WARNING));
export const makeInfoCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(title, body, opts, BotConfig.branding.colors.INFO));
export const makeCard = (
  color: number,
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(title, body, opts, color || undefined));

export function makeListCard(
  title: string,
  items: string[],
  page = 0,
  perPage = BotConfig.ui.defaultListPerPage,
  customIdPrefix?: string,
) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const slice = items.slice(page * perPage, (page + 1) * perPage);
  const body = slice.length ? slice.join("\n") : "*Nothing here yet.*";
  const footer =
    totalPages > 1
      ? `Page ${page + 1}/${totalPages} · ${items.length} items`
      : `${items.length} items`;

  const c = buildContainer(title, body, { footer });

  if (customIdPrefix && totalPages > 1) {
    c.addActionRowComponents((row) =>
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${customIdPrefix}:prev:${page}`)
          .setLabel("◀ Prev")
          .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 0),
        new ButtonBuilder()
          .setCustomId(`${customIdPrefix}:next:${page}`)
          .setLabel("Next ▶")
          .setEmoji(Emojis.parse(Emojis.ARROW_RIGHT))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1),
      ),
    );
  }

  return wrap(c);
}
