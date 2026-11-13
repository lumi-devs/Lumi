import type { Guild } from "discord.js";
import { type Lookback, LookbackValues } from "../constants.js";
import type {
  Counter,
  GuildTotals,
  MessageStats,
  SnapshotStats,
  VoiceStats,
} from "../queries.js";
import { formatCount, formatDuration, sampleSeries } from "../ranges.js";
import {
  ChartColors,
  type ChartPanel,
  type ChartSeries,
  type ListItem,
  type StatRow,
  type StatsCardPayload,
} from "../statsCard.js";

const Months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function utcDate(date: Date, includeYear: boolean): string {
  const base = `${Months[date.getUTCMonth()]} ${date.getUTCDate()}`;
  return includeYear ? `${base}, ${date.getUTCFullYear()}` : base;
}

export const dateFormatter = {
  format: (date: Date): string => utcDate(date, true),
};

const shortDateFormatter = {
  format: (date: Date): string => utcDate(date, false),
};

const hourFormatter = {
  format: (date: Date): string =>
    `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`,
};

export const ChartPointCount = 42;

export function displayUser(guild: Guild, userId: string): string {
  const member = guild.members.cache.get(userId);
  return member?.displayName ?? member?.user.username ?? `User ${userId}`;
}

export function displayChannel(guild: Guild, channelId: string): string {
  const channel = guild.channels.cache.get(channelId);
  return channel?.name ?? `Channel ${channelId}`;
}

export function chartLabels(
  start: Date,
  end: Date,
  count: number,
  lookback: Lookback,
): string[] {
  const total = Math.max(1, count);
  const startMs = start.getTime();
  const endMs = end.getTime();
  return Array.from({ length: total }, (_, index) => {
    const at = startMs + ((endMs - startMs) * index) / Math.max(1, total - 1);
    const date = new Date(at);
    if (lookback === "1d") return hourFormatter.format(date);
    return shortDateFormatter.format(date);
  });
}

export function rangeRows(
  totals: Record<Lookback, number>,
  format: (value: number) => string,
): StatRow[] {
  return LookbackValues.map((lookback) => ({
    label: lookback,
    value: format(totals[lookback]),
  }));
}

export function countRows(totals: Record<Lookback, number>): StatRow[] {
  return rangeRows(totals, (value) => `${formatCount(value)}`);
}

export function voiceRows(totals: Record<Lookback, number>): StatRow[] {
  return rangeRows(totals, (value) => formatDuration(value));
}

export function topUserItems(
  guild: Guild,
  entries: Counter[],
  format: (value: number) => string,
): ListItem[] {
  return entries.map((entry) => ({
    icon: "◆",
    label: displayUser(guild, entry.key),
    value: format(entry.value),
  }));
}

export function topChannelItems(
  guild: Guild,
  entries: Counter[],
  format: (value: number) => string,
): ListItem[] {
  return entries.map((entry) => ({
    icon: "#",
    label: displayChannel(guild, entry.key),
    value: format(entry.value),
  }));
}

export function messageChart(
  message: MessageStats,
  lookback: Lookback,
  includeVoice?: VoiceStats,
): ChartPanel {
  const series: ChartSeries[] = [
    {
      label: "Message",
      color: ChartColors.message,
      values: sampleSeries(message.series, ChartPointCount),
    },
  ];
  if (includeVoice) {
    series.push({
      label: "Voice",
      color: ChartColors.voice,
      values: sampleSeries(includeVoice.series, ChartPointCount),
    });
  }
  return {
    title: "Charts",
    series,
    labels: chartLabels(message.start, message.end, ChartPointCount, lookback),
  };
}

export function voiceChart(
  voice: VoiceStats,
  lookback: Lookback,
  includeMessage?: MessageStats,
): ChartPanel {
  const series: ChartSeries[] = [
    {
      label: "Voice",
      color: ChartColors.voice,
      values: sampleSeries(voice.series, ChartPointCount),
    },
  ];
  if (includeMessage) {
    series.unshift({
      label: "Message",
      color: ChartColors.message,
      values: sampleSeries(includeMessage.series, ChartPointCount),
    });
  }
  return {
    title: "Charts",
    series,
    labels: chartLabels(voice.start, voice.end, ChartPointCount, lookback),
  };
}

export function basePayload(
  title: string,
  subtitle: string,
  lookback: Lookback,
  view: "overview" | "chart",
): Pick<
  StatsCardPayload,
  "title" | "subtitle" | "lookback" | "view" | "footer"
> {
  return {
    title,
    subtitle,
    lookback,
    view,
    footer: `Server Lookback: Last ${lookback} · Timezone: UTC`,
  };
}

export interface ViewData {
  guild: Guild;
  lookback: Lookback;
  view: "overview" | "chart";
  totals: GuildTotals;
  message: MessageStats;
  voice: VoiceStats;
  snapshot: SnapshotStats;
}

export function serverBadges(
  guild: Guild,
  snapshot: SnapshotStats,
): StatsCardPayload["badges"] {
  return [
    { label: "Created On", value: dateFormatter.format(guild.createdAt) },
    {
      label: "Members",
      value: `${formatCount(snapshot.latest?.memberCount ?? guild.memberCount)}`,
    },
  ];
}
