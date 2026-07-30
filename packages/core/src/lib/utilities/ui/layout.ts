import { SeparatorBuilder, SectionBuilder, TextDisplayBuilder } from "@discordjs/builders";
import { SeparatorSpacingSize } from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";
import type { BadgeColor, Field, StatItem } from "./types.js";

const BADGE_MARKS: Record<BadgeColor, string> = {
  green: "🟢",
  red: "🔴",
  yellow: "🟡",
  blue: "🔵",
  grey: "⚪",
  purple: "🟣",
};

export function badge(label: string, color: BadgeColor = "grey"): string {
  return `${BADGE_MARKS[color]} \`${label}\``;
}

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

export function formatSubtitle(text: string, icon?: string): string {
  const formatted = icon ? `${icon} ${text}` : text;
  return `-# ${formatted}`;
}

export function metric(label: string, value: string): string {
  return `${Emojis.SPACE}${Emojis.SPACE}**${label}:** ${value}`;
}

export function metricsBlock(title: string, fields: Field[]): string {
  const header = `${Emojis.SPACE}__${title}__`;
  const lines = fields.map((f) => {
    const colorDot = f.color ? `${BADGE_MARKS[f.color]} ` : "";
    return `${Emojis.SPACE}${Emojis.SPACE}${colorDot}**${f.label}:** ${f.value}`;
  });
  return `${header}\n${lines.join("\n")}`;
}

export function statBlock(items: StatItem[]): string {
  return items
    .map((item) => {
      const trend = item.trend === "up" ? "📈" : item.trend === "down" ? "📉" : "";
      const sub = item.sublabel ? `\n${Emojis.SPACE}${Emojis.SPACE}${Emojis.SPACE}${Emojis.SPACE}${item.sublabel}` : "";
      return `${Emojis.SPACE}${trend} **${item.label}:** ${item.value}${sub}`;
    })
    .join("\n");
}

export function breadcrumbs(crumbs: string[], separator = " ❯ "): string {
  return crumbs
    .map((crumb, idx) =>
      idx === crumbs.length - 1 ? `**${crumb}**` : crumb,
    )
    .join(separator);
}

export const formatBreadcrumbs = breadcrumbs;

export function formatBreadcrumbHeader(crumbs: string[]): string {
  if (crumbs.length === 0) return "";
  return breadcrumbs(crumbs);
}

export function createSection(
  _title: string,
  content: string[],
): SectionBuilder {
  const section = new SectionBuilder();
  for (const line of content) {
    section.addTextDisplayComponents(new TextDisplayBuilder().setContent(line));
  }
  return section;
}

export function smallSeparator(divider: boolean): SeparatorBuilder {
  return new SeparatorBuilder()
    .setSpacing(SeparatorSpacingSize.Small)
    .setDivider(divider);
}

export const SB = {
  sm(divider: boolean): SeparatorBuilder {
    return smallSeparator(divider);
  },
  section(title: string, ...content: string[]): SectionBuilder {
    return createSection(title, content);
  },
  text(content: string): TextDisplayBuilder {
    return new TextDisplayBuilder().setContent(content);
  },
};