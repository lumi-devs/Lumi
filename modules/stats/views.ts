import type { Guild } from "discord.js";
import { type Lookback, LookbackValues } from "./constants.js";
import type {
  Counter,
  GuildTotals,
  MessageStats,
  SnapshotStats,
  TopStats,
  TopType,
  UserStats,
  VoiceStats,
} from "./queries.js";
import {
  formatCount,
  formatDuration,
  sampleSeries,
  topEntries,
} from "./ranges.js";
import {
  type ChartPanel,
  type ChartSeries,
  ChartColors,
  type ListItem,
  type ListPanel,
  type StatBox,
  type StatRow,
  type StatsCardPayload,
} from "./statsCard.js";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const hourFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export const ChartPointCount = 42;

function displayUser(guild: Guild, userId: string): string {
  const member = guild.members.cache.get(userId);
  return member?.displayName ?? member?.user.username ?? `User ${userId}`;
}

function displayChannel(guild: Guild, channelId: string): string {
  const channel = guild.channels.cache.get(channelId);
  return channel?.name ?? `Channel ${channelId}`;
}

function chartLabels(
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

function rangeRows(
  totals: Record<Lookback, number>,
  format: (value: number) => string,
): StatRow[] {
  return LookbackValues.map((lookback) => ({
    label: lookback,
    value: format(totals[lookback]),
  }));
}

function countRows(totals: Record<Lookback, number>): StatRow[] {
  return rangeRows(totals, (value) => `${formatCount(value)}`);
}

function voiceRows(totals: Record<Lookback, number>): StatRow[] {
  return rangeRows(totals, (value) => formatDuration(value));
}

function topUserItems(
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

function topChannelItems(
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

function messageChart(
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

function voiceChart(
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

function basePayload(
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

function serverBadges(
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

export function buildServerPayload(data: ViewData): StatsCardPayload {
  const { guild, lookback, view, totals, message, voice, snapshot } = data;
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
  const lists: ListPanel[] =
    view === "overview"
      ? [
          {
            title: "Top Members",
            icon: "◆",
            items: topUserItems(
              guild,
              topEntries(message.byUser, 3),
              (value) => `${formatCount(value)} msgs`,
            ),
          },
          {
            title: "Top Channels",
            icon: "#",
            items: topChannelItems(
              guild,
              topEntries(message.byChannel, 3),
              (value) => `${formatCount(value)} msgs`,
            ),
          },
        ]
      : [];

  return {
    ...basePayload("Server Overview", guild.name, lookback, view),
    iconUrl: guild.iconURL({ size: 128, extension: "png" }) ?? undefined,
    badges: serverBadges(guild, snapshot),
    boxes,
    lists,
    chart: messageChart(message, lookback, voice),
  };
}

export function buildMessagesPayload(data: ViewData): StatsCardPayload {
  const { guild, lookback, view, totals, message, snapshot } = data;
  const boxes: StatBox[] = [
    {
      title: "Server Lookback",
      icon: "◷",
      rows: [],
      big: {
        value: formatCount(message.total),
        label: "messages",
      },
    },
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
  ];
  return {
    ...basePayload("Messages", guild.name, lookback, view),
    iconUrl: guild.iconURL({ size: 128, extension: "png" }) ?? undefined,
    badges: serverBadges(guild, snapshot),
    boxes,
    lists:
      view === "overview"
        ? [
            {
              title: "Top Message Members",
              icon: "#",
              items: topUserItems(
                guild,
                topEntries(message.byUser, 3),
                (value) => `${formatCount(value)} msgs`,
              ),
            },
            {
              title: "Top Message Channels",
              icon: "#",
              items: topChannelItems(
                guild,
                topEntries(message.byChannel, 3),
                (value) => `${formatCount(value)} msgs`,
              ),
            },
          ]
        : [],
    chart: messageChart(message, lookback),
  };
}

export function buildVoicePayload(data: ViewData): StatsCardPayload {
  const { guild, lookback, view, totals, voice, snapshot } = data;
  const boxes: StatBox[] = [
    {
      title: "Server Lookback",
      icon: "◷",
      rows: [],
      big: {
        value: formatDuration(voice.totalSeconds),
        label: "voice activity",
      },
    },
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
  ];
  return {
    ...basePayload("Voice Activity", guild.name, lookback, view),
    iconUrl: guild.iconURL({ size: 128, extension: "png" }) ?? undefined,
    badges: serverBadges(guild, snapshot),
    boxes,
    lists:
      view === "overview"
        ? [
            {
              title: "Top Voice Members",
              icon: "♪",
              items: topUserItems(guild, topEntries(voice.byUser, 3), (value) =>
                formatDuration(value),
              ),
            },
            {
              title: "Top Voice Channels",
              icon: "♪",
              items: topChannelItems(
                guild,
                topEntries(voice.byChannel, 3),
                (value) => formatDuration(value),
              ),
            },
          ]
        : [],
    chart: voiceChart(voice, lookback),
  };
}

export function buildMembersPayload(data: ViewData): StatsCardPayload {
  const { guild, lookback, view, totals, message, voice, snapshot } = data;
  const boxes: StatBox[] = [
    {
      title: "Members",
      icon: "◆",
      rows: rangeRows(snapshot.averages.members, (value) => formatCount(value)),
    },
    {
      title: "Joined",
      icon: "+",
      rows: countRows(totals.joins),
    },
    {
      title: "Left",
      icon: "−",
      rows: countRows(totals.leaves),
    },
  ];
  return {
    ...basePayload("Members", guild.name, lookback, view),
    iconUrl: guild.iconURL({ size: 128, extension: "png" }) ?? undefined,
    badges: [
      {
        label: "Members",
        value: formatCount(snapshot.latest?.memberCount ?? 0),
      },
      {
        label: "Online",
        value: formatCount(snapshot.latest?.onlineCount ?? 0),
      },
    ],
    boxes,
    lists:
      view === "overview"
        ? [
            {
              title: "Top Message Members",
              icon: "#",
              items: topUserItems(
                guild,
                topEntries(message.byUser, 3),
                (value) => `${formatCount(value)} msgs`,
              ),
            },
            {
              title: "Top Voice Members",
              icon: "♪",
              items: topUserItems(guild, topEntries(voice.byUser, 3), (value) =>
                formatDuration(value),
              ),
            },
          ]
        : [],
    chart: {
      title: "Member Count",
      series: [
        {
          label: "Members",
          color: ChartColors.cyan,
          values: sampleSeries(snapshot.memberSeries, ChartPointCount),
        },
      ],
      labels: chartLabels(
        snapshot.start,
        snapshot.end,
        ChartPointCount,
        lookback,
      ),
    },
  };
}

export function buildChannelsPayload(data: ViewData): StatsCardPayload {
  const { guild, lookback, view, totals, message, voice, snapshot } = data;
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
      title: "Channels",
      icon: "#",
      rows: rangeRows(snapshot.averages.channels, (value) =>
        formatCount(value),
      ),
    },
  ];
  return {
    ...basePayload("Channels", guild.name, lookback, view),
    iconUrl: guild.iconURL({ size: 128, extension: "png" }) ?? undefined,
    badges: [
      {
        label: "Channels",
        value: formatCount(
          snapshot.latest?.channelCount ?? guild.channels.cache.size,
        ),
      },
      {
        label: "Roles",
        value: formatCount(
          snapshot.latest?.roleCount ?? guild.roles.cache.size,
        ),
      },
    ],
    boxes,
    lists:
      view === "overview"
        ? [
            {
              title: "Top Message Channels",
              icon: "#",
              items: topChannelItems(
                guild,
                topEntries(message.byChannel, 3),
                (value) => `${formatCount(value)} msgs`,
              ),
            },
            {
              title: "Top Voice Channels",
              icon: "♪",
              items: topChannelItems(
                guild,
                topEntries(voice.byChannel, 3),
                (value) => formatDuration(value),
              ),
            },
          ]
        : [],
    chart: messageChart(message, lookback, voice),
  };
}

export function buildStatusPayload(data: ViewData): StatsCardPayload {
  const { guild, lookback, view, snapshot } = data;
  const latest = snapshot.latest;
  const boxes: StatBox[] = [
    {
      title: "Members",
      icon: "◆",
      rows: rangeRows(snapshot.averages.members, (value) => formatCount(value)),
    },
    {
      title: "Online Average",
      icon: "●",
      rows: rangeRows(snapshot.averages.online, (value) => formatCount(value)),
    },
    {
      title: "Voice Average",
      icon: "♪",
      rows: rangeRows(snapshot.averages.voice, (value) => formatCount(value)),
    },
  ];
  const statusItems: ListItem[] = [
    {
      icon: "●",
      label: "Online",
      value: formatCount(latest?.onlineCount ?? 0),
    },
    { icon: "◐", label: "Idle", value: formatCount(latest?.idleCount ?? 0) },
    {
      icon: "◑",
      label: "Do Not Disturb",
      value: formatCount(latest?.dndCount ?? 0),
    },
    {
      icon: "○",
      label: "Offline",
      value: formatCount(latest?.offlineCount ?? 0),
    },
  ];
  const serverItems: ListItem[] = [
    {
      icon: "◆",
      label: "Members",
      value: formatCount(latest?.memberCount ?? 0),
    },
    {
      icon: "♪",
      label: "In Voice",
      value: formatCount(latest?.voiceCount ?? 0),
    },
    { icon: "★", label: "Boosts", value: formatCount(latest?.boostCount ?? 0) },
    {
      icon: "◈",
      label: "Boost Tier",
      value: String(latest?.boostTier ?? 0),
    },
  ];
  return {
    ...basePayload("Status", guild.name, lookback, view),
    iconUrl: guild.iconURL({ size: 128, extension: "png" }) ?? undefined,
    badges: [
      {
        label: "Online",
        value: formatCount(latest?.onlineCount ?? 0),
      },
      {
        label: "In Voice",
        value: formatCount(latest?.voiceCount ?? 0),
      },
    ],
    boxes,
    lists:
      view === "overview"
        ? [
            { title: "Status Now", icon: "●", items: statusItems },
            { title: "Server Now", icon: "◆", items: serverItems },
          ]
        : [],
    chart: {
      title: "Status (Online, Idle, DnD, Offline)",
      stacked: true,
      series: [
        {
          label: "Online",
          color: ChartColors.online,
          values: sampleSeries(snapshot.onlineSeries, ChartPointCount),
        },
        {
          label: "Idle",
          color: ChartColors.idle,
          values: sampleSeries(snapshot.idleSeries, ChartPointCount),
        },
        {
          label: "DnD",
          color: ChartColors.dnd,
          values: sampleSeries(snapshot.dndSeries, ChartPointCount),
        },
        {
          label: "Offline",
          color: ChartColors.offline,
          values: sampleSeries(snapshot.offlineSeries, ChartPointCount),
        },
      ],
      labels: chartLabels(
        snapshot.start,
        snapshot.end,
        ChartPointCount,
        lookback,
      ),
    },
  };
}

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
