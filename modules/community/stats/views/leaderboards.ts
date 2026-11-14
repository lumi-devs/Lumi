import type { Guild } from "discord.js";
import type { Lookback } from "../constants.js";
import type {
  GuildTotals,
  SnapshotStats,
  TopStats,
  TopType,
  UserStats,
} from "../queries.js";
import { formatCount, formatDuration, sampleSeries } from "../ranges.js";
import {
  ChartColors,
  type ListItem,
  type ListPanel,
  type StatBox,
  type StatsCardPayload,
} from "../statsCard.js";
import {
  basePayload,
  ChartPointCount,
  chartLabels,
  countRows,
  dateFormatter,
  displayChannel,
  displayUser,
  serverBadges,
  topChannelItems,
  voiceRows,
} from "./shared.js";

export interface UserViewData {
  guild: Guild;
  lookback: Lookback;
  view: "overview" | "chart";
  user: UserStats;
  target: {
    id: string;
    username: string;
    displayName: string;
    createdAt: Date;
    avatarUrl?: string;
    joinedAt?: Date | null;
  };
}

export function buildUserPayload(data: UserViewData): StatsCardPayload {
  const { guild, lookback, view, user, target } = data;
  const boxes: StatBox[] = [
    {
      title: "Messages",
      icon: "#",
      rows: countRows(user.messages),
    },
    {
      title: "Voice Activity",
      icon: "♪",
      rows: voiceRows(user.voice),
    },
    {
      title: "Ranks",
      icon: "★",
      rows: [
        {
          label: "Msg",
          value: user.messageRank
            ? `#${user.messageRank} / ${user.messageRankTotal}`
            : "—",
        },
        {
          label: "Voice",
          value: user.voiceRank
            ? `#${user.voiceRank} / ${user.voiceRankTotal}`
            : "—",
        },
        { label: "60d", value: `${formatCount(user.messages["60d"])} msgs` },
        { label: "60d", value: formatDuration(user.voice["60d"]) },
      ],
    },
  ];
  const lists: ListPanel[] =
    view === "overview"
      ? [
          {
            title: "Top Message Channels",
            icon: "#",
            items: topChannelItems(
              guild,
              user.topMessageChannels,
              (value) => `${formatCount(value)} msgs`,
            ),
          },
          {
            title: "Top Voice Channels",
            icon: "♪",
            items: topChannelItems(guild, user.topVoiceChannels, (value) =>
              formatDuration(value),
            ),
          },
        ]
      : [];
  return {
    ...basePayload(target.displayName, `@${target.username}`, lookback, view),
    iconUrl: target.avatarUrl,
    badges: [
      {
        label: "Created On",
        value: dateFormatter.format(target.createdAt),
      },
      {
        label: "Joined On",
        value: target.joinedAt
          ? dateFormatter.format(target.joinedAt)
          : "Not in server",
      },
    ],
    boxes,
    lists,
    chart: {
      title: "Charts",
      series: [
        {
          label: "Message",
          color: ChartColors.message,
          values: sampleSeries(user.messageSeries, ChartPointCount),
        },
        {
          label: "Voice",
          color: ChartColors.voice,
          values: sampleSeries(user.voiceSeries, ChartPointCount),
        },
      ],
      labels: chartLabels(user.start, user.end, ChartPointCount, lookback),
    },
  };
}

const TopTitles: Record<TopType, string> = {
  "message-users": "Top Message Members",
  "voice-users": "Top Voice Members",
  "message-channels": "Top Message Channels",
  "voice-channels": "Top Voice Channels",
};

export interface TopViewData {
  guild: Guild;
  lookback: Lookback;
  view: "overview" | "chart";
  totals: GuildTotals;
  top: TopStats;
  snapshot: SnapshotStats;
}

export function buildTopPayload(data: TopViewData): StatsCardPayload {
  const { guild, lookback, view, totals, top, snapshot } = data;
  const isMessage = top.type.startsWith("message");
  const isUser = top.type.endsWith("users");
  const formatValue = isMessage
    ? (value: number) => `${formatCount(value)} msgs`
    : (value: number) => formatDuration(value);
  const items: ListItem[] = top.entries.map((entry, index) => ({
    icon: isUser ? "◆" : "#",
    label: `${(top.page - 1) * 10 + index + 1}. ${
      isUser ? displayUser(guild, entry.key) : displayChannel(guild, entry.key)
    }`,
    value: formatValue(entry.value),
  }));
  const boxes: StatBox[] = [
    {
      title: "Messages",
      icon: "#",
      rows: countRows(totals.messages),
    },
    {
      title: "Voice Activity",
      icon: "♪",
      rows: voiceRows(totals.voice),
    },
    {
      title: "Contributors",
      icon: "◆",
      rows: countRows(totals.contributors),
    },
  ];
  return {
    ...basePayload(TopTitles[top.type], guild.name, lookback, view),
    iconUrl: guild.iconURL({ size: 128, extension: "png" }) ?? undefined,
    badges: serverBadges(guild, snapshot),
    boxes,
    lists:
      view === "overview"
        ? [
            {
              title: `${TopTitles[top.type]} · Page ${top.page}/${top.totalPages}`,
              icon: isMessage ? "#" : "♪",
              items,
            },
          ]
        : [],
    chart: {
      title: isMessage ? "Message Timeline" : "Voice Timeline",
      series: [
        {
          label: isMessage ? "Message" : "Voice",
          color: isMessage ? ChartColors.message : ChartColors.voice,
          values: sampleSeries(top.series, ChartPointCount),
        },
      ],
      labels: chartLabels(top.start, top.end, ChartPointCount, lookback),
    },
  };
}
