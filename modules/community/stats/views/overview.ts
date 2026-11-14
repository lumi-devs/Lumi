import { formatCount, formatDuration, topEntries } from "../ranges.js";
import type { ListPanel, StatBox, StatsCardPayload } from "../statsCard.js";
import {
  basePayload,
  countRows,
  messageChart,
  serverBadges,
  topChannelItems,
  topUserItems,
  type ViewData,
  voiceChart,
  voiceRows,
} from "./shared.js";

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
