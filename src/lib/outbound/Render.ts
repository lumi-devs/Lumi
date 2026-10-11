import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { Colors } from "discord.js";
import { isNullish } from "#src/shared/Index.ts";
import { makeCard, noPingCard, type CardReply } from "#src/lib/ui/Cards.js";

export interface AuditEntry {
  action: string;
  targetId: string;
  actorId: string;
  guildId: string;
  moduleName?: string;
  reason?: string;
  color?: number;
  caseNumber?: number;
  channelId?: string;
  extra?: Record<string, unknown>;
}

export function renderAuditCard(entry: AuditEntry, at: number): CardReply {
  const title = isNullish(entry.caseNumber)
    ? entry.action
    : `${entry.action} - Case #${entry.caseNumber}`;

  const lines = [
    `**Target**: ${userMention(entry.targetId)} (${entry.targetId})`,
    `**Moderator**: ${userMention(entry.actorId)} (${entry.actorId})`,
  ];

  if (entry.reason) {
    lines.push(`**Reason**: ${entry.reason}`);
  }

  if (entry.extra) {
    for (const [key, val] of Object.entries(entry.extra)) {
      lines.push(`**${key}**: ${String(val)}`);
    }
  }

  return makeCard(entry.color ?? Colors.Orange, title, lines.join("\n"), {
    footer: stamp(at),
  });
}

export interface LogCard {
  color: number;
  title: string;
  lines: string[];
}

export function renderLogCard(card: LogCard, at: number): CardReply {
  return noPingCard(
    makeCard(card.color, card.title, card.lines.join("\n"), {
      footer: stamp(at),
    }),
  );
}

const stamp = (at: number) =>
  time(new Date(at), TimestampStyles.ShortDateTime);
