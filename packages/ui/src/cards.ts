import {
  type ActionRowBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "@discordjs/builders";
import type { MessageMentionOptions } from "discord.js";
import { MessageFlags } from "discord.js";
import { formatBreadcrumbs, formatStatusBadge, formatSubtitle } from "./layout.js";
import { resolveCardColor } from "./palette.js";
import { buildSafeActionRows } from "./panels.js";

export interface CardReply {
  readonly flags?: number;
  readonly components: readonly ContainerBuilder[];
  readonly allowedMentions?: MessageMentionOptions;
}

export interface CardOptions {
  subtitle?: string | undefined;
  breadcrumbs?: string[] | undefined;
  statusBadge?: { status: string; label?: string | undefined } | undefined;
  footer?: string | undefined;
  thumbnailUrl?: string | undefined;
  divider?: boolean | undefined;
  hideTitle?: boolean | undefined;
  noAccent?: boolean | undefined;
  sections?: SectionBuilder[] | undefined;
  actionRows?: ActionRowBuilder<any>[] | undefined;
  separatorAboveActionRows?: boolean | undefined;
  mediaGallery?: MediaGalleryBuilder | undefined;
  headerImages?: string[] | undefined;
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
  if (accentColor !== undefined && !opts.noAccent) {
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

  if (!opts.hideTitle && title) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
    );
    if (opts.subtitle) {
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(formatSubtitle(opts.subtitle)),
      );
    }
    c.addSeparatorComponents((sep) =>
      sep.setSpacing(1).setDivider(opts.divider ?? true),
    );
  }

  if (opts.sections && opts.sections.length > 0) {
    for (const sec of opts.sections) {
      c.addSectionComponents(sec);
    }
  }

  const parts = Array.isArray(body) ? body : [body];
  const thumbUrl =
    !opts.sections?.length && opts.thumbnailUrl;

  if (thumbUrl) {
    const thumbSec = new SectionBuilder().setThumbnailAccessory(
      new ThumbnailBuilder().setURL(thumbUrl),
    );
    const sectionParts = parts.filter((p) => p && p.length > 0).slice(0, 1);
    for (const part of sectionParts.length > 0 ? sectionParts : [title]) {
      thumbSec.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(part),
      );
    }
    c.addSectionComponents(thumbSec);
    for (const part of parts.filter((p) => p && p.length > 0).slice(1)) {
      c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(true));
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(part));
    }
  } else {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i > 0) c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(true));
      if (part && part.length > 0) {
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(part));
      }
    }
  }

  const headerUrls = (opts.headerImages ?? [])
    .filter((url) => url && url.length > 0)
    .slice(0, 10);
  if (headerUrls.length > 0) {
    c.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        ...headerUrls.map((url) => new MediaGalleryItemBuilder({ media: { url } })),
      ),
    );
  }

  if (opts.mediaGallery) {
    c.addMediaGalleryComponents(opts.mediaGallery);
  }

  if (opts.footer) {
    c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(true));
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${opts.footer}`),
    );
  }

  const actionRows = buildSafeActionRows(opts.actionRows ?? []);
  if (opts.separatorAboveActionRows && actionRows.length > 0) {
    c.addSeparatorComponents((sep) => sep.setSpacing(1).setDivider(true));
  }
  for (let r = 0; r < actionRows.length; r++) {
    const row = actionRows[r]!;
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
) => makeCard(undefined, title, body, opts);

export const makeCard = (
  color: number | undefined,
  title: string,
  body: string | string[],
  opts?: CardOptions,
) => wrap(buildContainer(title, body, opts, color));

const cutText = (text: string, limit: number): string =>
  text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;

export const TextDisplayLimit = 4000;

export function fitLines(
  lines: string[],
  budget = TextDisplayLimit,
): string {
  const kept: string[] = [];
  let used = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const cost = kept.length > 0 ? line.length + 1 : line.length;

    if (used + cost > budget) {
      const remaining = lines.length - i;
      const notice = `-# ...and ${remaining} more item(s).`;
      const noticeCost = kept.length > 0 ? notice.length + 1 : notice.length;
      if (used + noticeCost <= budget) {
        kept.push(notice);
      } else if (kept.length === 0) {
        kept.push(cutText(line, budget));
      }
      break;
    }
    kept.push(line);
    used += cost;
  }

  return kept.join("\n");
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

export function makeEmptyCard(
  title: string,
  reason: string,
  suggestion?: string,
  opts?: CardOptions,
): CardReply {
  const body = suggestion
    ? fitLines([reason, "", `**Try:** ${suggestion}`])
    : reason;
  return makeCard(
    undefined,
    `📭 ${title}`,
    body,
    {
      ...opts,
      footer: opts?.footer ?? "No items to display",
    },
  );
}

