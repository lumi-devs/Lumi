import {
  ActionRowBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,

  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { BotConfig } from "./config.js";
import { badge, formatBreadcrumbs, formatStatusBadge, formatSubtitle } from "./ui/layout.js";
import type { CardReply } from "./ui/types.js";

export type { CardReply } from "./ui/types.js";

export const CARD_ACCENTS = {
  PRIMARY: 0x5865f2,
  INFO: 0x3498db,
  SUCCESS: 0x2ecc71,
  WARNING: 0xf1c40f,
  ERROR: 0xe74c3c,
  PURPLE: 0x9b59b6,
  CYAN: 0x1abc9c,
} as const;

export { formatStatusBadge, formatSubtitle, formatBreadcrumbs, badge };
export const makeStatusBadge = formatStatusBadge;

export interface CardOptions {
  subtitle?: string;
  breadcrumbs?: string[];
  statusBadge?: { status: string; label?: string };
  footer?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  divider?: boolean;
  sections?: SectionBuilder[];
  actionRows?: ActionRowBuilder<MessageActionRowComponentBuilder | any>[];
  mediaGallery?: MediaGalleryBuilder;
}

export const ephemeralCard = (card: CardReply): CardReply => ({
  ...card,
  flags: (card.flags ?? MessageFlags.IsComponentsV2) | MessageFlags.Ephemeral,
});

export const noPingCard = (card: CardReply): CardReply => ({
  ...card,
  allowedMentions: { parse: [] },
});

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

  // Optional Header Breadcrumbs & Status Badges
  const headerParts: string[] = [];
  if (opts.breadcrumbs && opts.breadcrumbs.length > 0) {
    headerParts.push(formatBreadcrumbs(opts.breadcrumbs));
  }
  if (opts.statusBadge) {
    headerParts.push(formatStatusBadge(opts.statusBadge.status, opts.statusBadge.label));
  }
  if (headerParts.length > 0) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerParts.join(" · ")),
    );
  }

  // Main Title & Subtitle
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}`),
  );
  if (opts.subtitle) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(formatSubtitle(opts.subtitle)),
    );
  }

  c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(opts.divider ?? true));

  // Sections if provided
  if (opts.sections && opts.sections.length > 0) {
    for (const sec of opts.sections) {
      c.addSectionComponents(sec);
    }
  }

  // Main Body Parts
  const parts = Array.isArray(body) ? body : [body];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i > 0) c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(true));
    if (part && part.length > 0) {
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(part));
    }
  }

  // Thumbnail accessory section if URL provided without explicit sections
  const thumbUrl = opts.thumbnailUrl ?? opts.thumbnail;
  if (thumbUrl && (!opts.sections || opts.sections.length === 0)) {
    const thumbSec = new SectionBuilder().setThumbnailAccessory(
      new ThumbnailBuilder().setURL(thumbUrl),
    );
    thumbSec.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Thumbnail Preview`));
    c.addSectionComponents(thumbSec);
  }

  // Footer
  if (opts.footer) {
    c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(false));
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${opts.footer}`),
    );
  }

  // Media Gallery
  if (opts.mediaGallery) {
    c.addMediaGalleryComponents(opts.mediaGallery);
  }

  // Action Rows & Component Selects
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
  opts: CardOptions = {},
): CardReply {
  const bodyParts: string[] = [];
  if (items.length === 0) {
    bodyParts.push("-# *No items to display.*");
  } else {
    for (const item of items) {
      bodyParts.push(`• ${item}`);
    }
  }
  return makeInfoCard(title, bodyParts, opts);
}