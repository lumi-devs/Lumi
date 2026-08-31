import {
  ActionRowBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,

  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { cutText } from "@sapphire/utilities";
import { MessageFlags } from "discord.js";
import { resolveCardColor } from "./config.js";
import { badge, formatBreadcrumbs, formatStatusBadge, formatSubtitle } from "./ui/layout.js";
import type { CardReply } from "./ui/types.js";

export type { CardReply } from "./ui/types.js";
export { resolveCardColor, defaultCardColors, type CardColorKey } from "./config.js";

export { formatStatusBadge, formatSubtitle, formatBreadcrumbs, badge };

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
  /** Adds a divider above actionRows - only used above the hub tab bar so it doesn't blend into the content above it. */
  separatorAboveActionRows?: boolean;
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
  if (accentColor !== undefined) {
    c.setAccentColor(accentColor);
  }

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

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}`),
  );
  if (opts.subtitle) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(formatSubtitle(opts.subtitle)),
    );
  }

  c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(opts.divider ?? true));

  if (opts.sections && opts.sections.length > 0) {
    for (const sec of opts.sections) {
      c.addSectionComponents(sec);
    }
  }

  const parts = Array.isArray(body) ? body : [body];
  const thumbUrl =
    !opts.sections?.length && (opts.thumbnailUrl ?? opts.thumbnail);

  if (thumbUrl) {
    // The thumbnail renders beside the first body lines (max 3 per section).
    const thumbSec = new SectionBuilder().setThumbnailAccessory(
      new ThumbnailBuilder().setURL(thumbUrl),
    );
    const sectionParts = parts.filter((p) => p && p.length > 0).slice(0, 3);
    for (const part of sectionParts.length > 0 ? sectionParts : [title]) {
      thumbSec.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(part),
      );
    }
    c.addSectionComponents(thumbSec);
    for (const part of parts.filter((p) => p && p.length > 0).slice(3)) {
      c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(true));
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(part));
    }
  } else {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i > 0)
        c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(true));
      if (part && part.length > 0) {
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(part));
      }
    }
  }

  if (opts.footer) {
    c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(false));
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${opts.footer}`),
    );
  }

  if (opts.mediaGallery) {
    c.addMediaGalleryComponents(opts.mediaGallery);
  }

  if (opts.separatorAboveActionRows && opts.actionRows?.length) {
    c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(true));
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
) => makeCard(resolveCardColor("success"), title, body, opts);

export const makeErrorCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => makeCard(resolveCardColor("error"), title, body, opts);

export const makeWarningCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => makeCard(resolveCardColor("warning"), title, body, opts);

export const makeInfoCard = (
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => makeCard(resolveCardColor("info"), title, body, opts);

export const makeCard = (
  color: number | undefined,
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(title, body, opts, color || undefined));

/** Discord's per-TextDisplay content limit for Components V2 messages. */
export const TextDisplayLimit = 4000;

/**
 * Join lines into one TextDisplay body that fits Discord's limit.
 *
 * @discordjs/builders validates this client-side and throws, so an oversized
 * body fails the entire reply rather than being truncated in transit - a
 * per-item cap is not enough on its own, because enough capped items still
 * overflow the total.
 */
export function fitLines(
  lines: string[],
  budget = TextDisplayLimit,
): string {
  const kept: string[] = [];
  let used = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const notice = `-# ...and ${lines.length - i} more item(s).`;
    const cost = kept.length > 0 ? line.length + 1 : line.length;

    if (used + cost > budget - (notice.length + 1)) {
      kept.push(notice);
      break;
    }
    kept.push(line);
    used += cost;
  }

  return kept.join("\n").slice(0, budget);
}

export function makeListCard(
  title: string,
  items: string[],
  opts: CardOptions = {},
): CardReply {
  const bodyParts: string[] = [];
  if (items.length === 0) {
    bodyParts.push("-# *No items to display.*");
  } else {
    const maxVisibleItems = 25;
    const visibleItems = items.slice(0, maxVisibleItems);
    const lines = visibleItems.map((item) => `• ${cutText(item, 200)}`);
    if (items.length > maxVisibleItems) {
      lines.push(`-# ...and ${items.length - maxVisibleItems} more item(s).`);
    }
    bodyParts.push(fitLines(lines));
  }
  return makeInfoCard(title, bodyParts, opts);
}