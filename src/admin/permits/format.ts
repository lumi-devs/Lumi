import type { PermitTargetType, Polarity } from "@lumi/permits";
import { GlobalPermitNamespace, permitNamespaces } from "./nodes.js";

export const formatTimestamp = (value: Date | string): string =>
  `<t:${Math.floor(new Date(value).getTime() / 1000)}:F>`;

export const targetTypeLabel = (targetType: PermitTargetType): string => {
  if (targetType === "USER") return "User";
  if (targetType === "ROLE") return "Role";
  return "Channel";
};

export const targetMention = (
  targetType: PermitTargetType,
  targetId: string,
): string => {
  if (targetType === "USER") return `<@${targetId}>`;
  if (targetType === "ROLE") return `<@&${targetId}>`;
  return `<#${targetId}>`;
};

export const polarityIcon = (polarity: Polarity): string =>
  polarity === "Grant" ? "✅" : "⛔";

export const defaultNamespace = (nodes: string[]): string => {
  const namespaces = permitNamespaces(nodes);
  if (namespaces.includes("mod")) return "mod";
  return namespaces[0] ?? GlobalPermitNamespace;
};

export const expiryFromValue = (value: string): Date | null | undefined => {
  const now = Date.now();
  if (value === "never") return null;
  if (value === "1h") return new Date(now + 60 * 60 * 1000);
  if (value === "1d") return new Date(now + 24 * 60 * 60 * 1000);
  if (value === "7d") return new Date(now + 7 * 24 * 60 * 60 * 1000);
  if (value === "30d") return new Date(now + 30 * 24 * 60 * 60 * 1000);
  return undefined;
};
