import type { BadgeColor } from "./types.js";

const BadgeMarks: Record<BadgeColor, string> = {
  green: "🟢",
  red: "🔴",
  yellow: "🟡",
  blue: "🔵",
  grey: "⚪",
  purple: "🟣",
};

export function badge(label: string, color: BadgeColor = "grey"): string {
  return `${BadgeMarks[color]} \`${label}\``;
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

export function formatBreadcrumbs(crumbs: string[], separator = " ❯ "): string {
  return crumbs
    .map((crumb, idx) =>
      idx === crumbs.length - 1 ? `**${crumb}**` : crumb,
    )
    .join(separator);
}

export function formatBreadcrumbHeader(crumbs: string[]): string {
  if (crumbs.length === 0) return "";
  return formatBreadcrumbs(crumbs);
}

export function formatPageFooter(
  pageIndex: number,
  totalPages: number,
  hintOrTotalItems?: string | number,
): string {
  const pageStr = `Page ${pageIndex + 1} of ${Math.max(1, totalPages)}`;
  if (typeof hintOrTotalItems === "number") {
    return `${pageStr} · ${hintOrTotalItems} item${hintOrTotalItems === 1 ? "" : "s"}`;
  }
  if (typeof hintOrTotalItems === "string" && hintOrTotalItems.length > 0) {
    return `${pageStr} · ${hintOrTotalItems}`;
  }
  return pageStr;
}