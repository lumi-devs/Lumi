import {
  formatCount,
  formatDuration,
  sampleSeries,
  topEntries,
} from "../ranges.js";
import {
  ChartColors,
  type ListItem,
  type StatBox,
  type StatsCardPayload,
} from "../statsCard.js";
import {
  basePayload,
  ChartPointCount,
  chartLabels,
  countRows,
  messageChart,
  rangeRows,
  topChannelItems,
  topUserItems,
  type ViewData,
  voiceRows,
} from "./shared.js";

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
