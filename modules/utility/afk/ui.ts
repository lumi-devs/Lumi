import { makeCard, type CardReply } from "@lumi/ui";

type AfkStatus = "set" | "updated" | "already";

const StatusTitles: Record<AfkStatus, string> = {
  set: "**💤 AFK Set**",
  updated: "**✏️ AFK Updated**",
  already: "**💤 Already AFK**",
};

const statusBody = (status: AfkStatus, reason: string): string => {
  if (status === "already") {
    return `You are already AFK with the reason: **${reason}**`;
  }
  if (status === "updated") {
    return `AFK reason updated to: **${reason}**`;
  }
  return `You are now AFK: **${reason}**`;
};

const statusCard = (title: string, body: string): CardReply =>
  makeCard(undefined, "", [title, body], { hideTitle: true });

export const sanitizeAfkReason = (reason: string, max: number): string => {
  const collapsed =
    reason
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(" ")
      .replace(/\s+/g, " ") || "AFK";
  return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
};

export const formatAfkDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
};

export const buildAfkStatusCard = (
  status: AfkStatus,
  reason: string,
): CardReply => statusCard(StatusTitles[status], statusBody(status, reason));

export const buildAfkRemovalCard = (duration: string): CardReply =>
  statusCard("**👋 Welcome Back!**", `AFK removed.\nAFK for **${duration}**.`);

export const buildAfkMentionCard = (
  name: string,
  reason: string,
  duration: string,
): CardReply => ({
  ...makeCard(
    undefined,
    `💤 ${name} is AFK`,
    `**Reason:** ${reason}\n**AFK for:** ${duration}`,
  ),
  allowedMentions: { repliedUser: true },
});
