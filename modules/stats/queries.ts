import type { ModuleServices } from "@lumi/module-kit";
import { type Lookback, LookbackValues } from "./constants.js";
import {
  aggregateAverageSeries,
  aggregateSeries,
  type RankedEntry,
  rangeStart,
  rankOf,
  sampleSeries,
  sumInWindow,
  topEntries,
} from "./ranges.js";

type TotalsByLookback = Record<Lookback, number>;

export interface Counter {
  key: string;
  value: number;
}

export interface GuildTotals {
  messages: TotalsByLookback;
  voice: TotalsByLookback;
  contributors: TotalsByLookback;
  joins: TotalsByLookback;
  leaves: TotalsByLookback;
  boosts: TotalsByLookback;
  unboosts: TotalsByLookback;
}

export interface MessageStats {
  total: number;
  byUser: Map<string, number>;
  byChannel: Map<string, number>;
  series: number[];
  bucketMs: number;
  start: Date;
  end: Date;
}

export interface VoiceStats {
  totalSeconds: number;
  byUser: Map<string, number>;
  byChannel: Map<string, number>;
  series: number[];
  bucketMs: number;
  start: Date;
  end: Date;
}

export interface SnapshotStats {
  latest: {
    memberCount: number;
    onlineCount: number;
    idleCount: number;
    dndCount: number;
    offlineCount: number;
    voiceCount: number;
    channelCount: number;
    roleCount: number;
    boostCount: number;
    boostTier: number;
  } | null;
  memberSeries: number[];
  onlineSeries: number[];
  idleSeries: number[];
  dndSeries: number[];
  offlineSeries: number[];
  voiceSeries: number[];
  channelSeries: number[];
  boostSeries: number[];
  bucketMs: number;
  start: Date;
  end: Date;
  averages: {
    members: TotalsByLookback;
    online: TotalsByLookback;
    voice: TotalsByLookback;
    channels: TotalsByLookback;
    boosts: TotalsByLookback;
  };
}

export interface UserStats {
  userId: string;
  messages: TotalsByLookback;
  voice: TotalsByLookback;
  messageSeries: number[];
  voiceSeries: number[];
  topMessageChannels: Counter[];
  topVoiceChannels: Counter[];
  messageRank: number;
  messageRankTotal: number;
  voiceRank: number;
  voiceRankTotal: number;
  bucketMs: number;
  start: Date;
  end: Date;
}

export type TopType =
  "message-users" | "voice-users" | "message-channels" | "voice-channels";

export interface TopStats {
  type: TopType;
  entries: RankedEntry[];
  allEntries: RankedEntry[];
  page: number;
  totalPages: number;
  total: number;
  series: number[];
  bucketMs: number;
  start: Date;
  end: Date;
}

const HourMs = 3_600_000;
const DayMs = 24 * HourMs;

export function chartBucketMs(lookback: Lookback): number {
  if (lookback === "1d") return HourMs;
  if (lookback === "7d") return 6 * HourMs;
  return DayMs;
}

function emptyTotals(): TotalsByLookback {
  return { "1d": 0, "7d": 0, "30d": 0, "60d": 0 };
}

function asNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function prismaOf(services: ModuleServices): any {
  return services.db.prisma;
}

interface RawSeriesRow {
  bucket: Date | string;
  total: bigint | number | string;
}

async function messageSeries(
  prisma: any,
  guildId: string,
  since: Date,
  bucketSeconds: number,
  filter?: { column: "user_id" | "channel_id"; value: string },
): Promise<RawSeriesRow[]> {
  if (filter?.column === "user_id") {
    return prisma.$queryRaw`
      SELECT to_timestamp(floor(extract(epoch FROM bucket_start) / ${bucketSeconds}::numeric) * ${bucketSeconds}::numeric) AS bucket,
             SUM(count)::bigint AS total
      FROM stats_message_buckets
      WHERE guild_id = ${guildId} AND bucket_start >= ${since} AND user_id = ${filter.value}
      GROUP BY 1 ORDER BY 1`;
  }
  if (filter?.column === "channel_id") {
    return prisma.$queryRaw`
      SELECT to_timestamp(floor(extract(epoch FROM bucket_start) / ${bucketSeconds}::numeric) * ${bucketSeconds}::numeric) AS bucket,
             SUM(count)::bigint AS total
      FROM stats_message_buckets
      WHERE guild_id = ${guildId} AND bucket_start >= ${since} AND channel_id = ${filter.value}
      GROUP BY 1 ORDER BY 1`;
  }
  return prisma.$queryRaw`
    SELECT to_timestamp(floor(extract(epoch FROM bucket_start) / ${bucketSeconds}::numeric) * ${bucketSeconds}::numeric) AS bucket,
           SUM(count)::bigint AS total
    FROM stats_message_buckets
    WHERE guild_id = ${guildId} AND bucket_start >= ${since}
    GROUP BY 1 ORDER BY 1`;
}

async function voiceSeries(
  prisma: any,
  guildId: string,
  since: Date,
  bucketSeconds: number,
  filter?: { column: "user_id" | "channel_id"; value: string },
): Promise<RawSeriesRow[]> {
  if (filter?.column === "user_id") {
    return prisma.$queryRaw`
      SELECT to_timestamp(floor(extract(epoch FROM bucket_start) / ${bucketSeconds}::numeric) * ${bucketSeconds}::numeric) AS bucket,
             SUM(seconds)::bigint AS total
      FROM stats_voice_buckets
      WHERE guild_id = ${guildId} AND bucket_start >= ${since} AND user_id = ${filter.value}
      GROUP BY 1 ORDER BY 1`;
  }
  if (filter?.column === "channel_id") {
    return prisma.$queryRaw`
      SELECT to_timestamp(floor(extract(epoch FROM bucket_start) / ${bucketSeconds}::numeric) * ${bucketSeconds}::numeric) AS bucket,
             SUM(seconds)::bigint AS total
      FROM stats_voice_buckets
      WHERE guild_id = ${guildId} AND bucket_start >= ${since} AND channel_id = ${filter.value}
      GROUP BY 1 ORDER BY 1`;
  }
  return prisma.$queryRaw`
    SELECT to_timestamp(floor(extract(epoch FROM bucket_start) / ${bucketSeconds}::numeric) * ${bucketSeconds}::numeric) AS bucket,
           SUM(seconds)::bigint AS total
    FROM stats_voice_buckets
    WHERE guild_id = ${guildId} AND bucket_start >= ${since}
    GROUP BY 1 ORDER BY 1`;
}

function seriesFromRows(
  rows: RawSeriesRow[],
  startMs: number,
  endMs: number,
  bucketMs: number,
): number[] {
  return aggregateSeries(
    rows.map((row) => ({
      bucketStart: new Date(row.bucket).getTime(),
      value: asNumber(row.total),
    })),
    startMs,
    endMs,
    bucketMs,
  );
}

function mapFromGroups(
  groups: ReadonlyArray<Record<string, unknown>>,
  key: string,
  sumField: "count" | "seconds",
): Map<string, number> {
  const map = new Map<string, number>();
  for (const group of groups) {
    const id = group[key];
    if (typeof id !== "string") continue;
    const sum = group._sum as Record<string, unknown> | undefined;
    map.set(id, asNumber(sum?.[sumField] ?? 0));
  }
  return map;
}

async function sumMessage(
  prisma: any,
  guildId: string,
  since: Date,
): Promise<number> {
  const result = await prisma.statsMessageBucket.aggregate({
    where: { guildId, bucketStart: { gte: since } },
    _sum: { count: true },
  });
  return asNumber(result?._sum?.count);
}

async function sumVoice(
  prisma: any,
  guildId: string,
  since: Date,
): Promise<number> {
  const result = await prisma.statsVoiceBucket.aggregate({
    where: { guildId, bucketStart: { gte: since } },
    _sum: { seconds: true },
  });
  return asNumber(result?._sum?.seconds);
}

async function countContributors(
  prisma: any,
  guildId: string,
  since: Date,
): Promise<number> {
  const groups = await prisma.statsMessageBucket.groupBy({
    by: ["userId"],
    where: { guildId, bucketStart: { gte: since } },
  });
  return Array.isArray(groups) ? groups.length : 0;
}

export async function loadGuildTotals(
  services: ModuleServices,
  guildId: string,
  nowMs: number = Date.now(),
): Promise<GuildTotals> {
  const prisma = prismaOf(services);
  const totals: GuildTotals = {
    messages: emptyTotals(),
    voice: emptyTotals(),
    contributors: emptyTotals(),
    joins: emptyTotals(),
    leaves: emptyTotals(),
    boosts: emptyTotals(),
    unboosts: emptyTotals(),
  };

  const eventRows = await prisma.statsEvent.findMany({
    where: { guildId, createdAt: { gte: rangeStart("60d", nowMs) } },
    select: { type: true, createdAt: true },
  });

  await Promise.all(
    LookbackValues.map(async (lookback) => {
      const since = rangeStart(lookback, nowMs);
      const [messages, voice, contributors] = await Promise.all([
        sumMessage(prisma, guildId, since),
        sumVoice(prisma, guildId, since),
        countContributors(prisma, guildId, since),
      ]);
      totals.messages[lookback] = messages;
      totals.voice[lookback] = voice;
      totals.contributors[lookback] = contributors;

      const startMs = since.getTime();
      const endMs = nowMs;
      for (const event of eventRows) {
        const at = new Date(event.createdAt).getTime();
        if (at < startMs || at >= endMs) continue;
        if (event.type === "join") totals.joins[lookback]++;
        else if (event.type === "leave") totals.leaves[lookback]++;
        else if (event.type === "boost") totals.boosts[lookback]++;
        else if (event.type === "unboost") totals.unboosts[lookback]++;
      }
    }),
  );

  return totals;
}

export async function loadMessageStats(
  services: ModuleServices,
  guildId: string,
  lookback: Lookback,
  nowMs: number = Date.now(),
): Promise<MessageStats> {
  const prisma = prismaOf(services);
  const start = rangeStart(lookback, nowMs);
  const end = new Date(nowMs);
  const bucketMs = chartBucketMs(lookback);
  const bucketSeconds = Math.floor(bucketMs / 1000);

  const [total, userGroups, channelGroups, rows] = await Promise.all([
    sumMessage(prisma, guildId, start),
    prisma.statsMessageBucket.groupBy({
      by: ["userId"],
      where: { guildId, bucketStart: { gte: start } },
      _sum: { count: true },
    }),
    prisma.statsMessageBucket.groupBy({
      by: ["channelId"],
      where: { guildId, bucketStart: { gte: start } },
      _sum: { count: true },
    }),
    messageSeries(prisma, guildId, start, bucketSeconds),
  ]);

  return {
    total,
    byUser: mapFromGroups(userGroups, "userId", "count"),
    byChannel: mapFromGroups(channelGroups, "channelId", "count"),
    series: seriesFromRows(rows, start.getTime(), nowMs, bucketMs),
    bucketMs,
    start,
    end,
  };
}

export async function loadVoiceStats(
  services: ModuleServices,
  guildId: string,
  lookback: Lookback,
  nowMs: number = Date.now(),
): Promise<VoiceStats> {
  const prisma = prismaOf(services);
  const start = rangeStart(lookback, nowMs);
  const end = new Date(nowMs);
  const bucketMs = chartBucketMs(lookback);
  const bucketSeconds = Math.floor(bucketMs / 1000);

  const [totalSeconds, userGroups, channelGroups, rows] = await Promise.all([
    sumVoice(prisma, guildId, start),
    prisma.statsVoiceBucket.groupBy({
      by: ["userId"],
      where: { guildId, bucketStart: { gte: start } },
      _sum: { seconds: true },
    }),
    prisma.statsVoiceBucket.groupBy({
      by: ["channelId"],
      where: { guildId, bucketStart: { gte: start } },
      _sum: { seconds: true },
    }),
    voiceSeries(prisma, guildId, start, bucketSeconds),
  ]);

  return {
    totalSeconds,
    byUser: mapFromGroups(userGroups, "userId", "seconds"),
    byChannel: mapFromGroups(channelGroups, "channelId", "seconds"),
    series: seriesFromRows(rows, start.getTime(), nowMs, bucketMs),
    bucketMs,
    start,
    end,
  };
}

function averageInWindow(
  rows: ReadonlyArray<{ capturedAt: Date | string }>,
  key: string,
  startMs: number,
  endMs: number,
): number {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    const at = new Date(row.capturedAt).getTime();
    if (at < startMs || at >= endMs) continue;
    total += asNumber((row as Record<string, unknown>)[key]);
    count++;
  }
  return count > 0 ? total / count : 0;
}

export async function loadSnapshotStats(
  services: ModuleServices,
  guildId: string,
  lookback: Lookback,
  nowMs: number = Date.now(),
): Promise<SnapshotStats> {
  const prisma = prismaOf(services);
  const start = rangeStart(lookback, nowMs);
  const end = new Date(nowMs);
  const bucketMs = chartBucketMs(lookback);

  const [latest, rows, allRows] = await Promise.all([
    prisma.statsSnapshot.findFirst({
      where: { guildId },
      orderBy: { capturedAt: "desc" },
    }),
    prisma.statsSnapshot.findMany({
      where: { guildId, capturedAt: { gte: start } },
      orderBy: { capturedAt: "asc" },
    }),
    prisma.statsSnapshot.findMany({
      where: { guildId, capturedAt: { gte: rangeStart("60d", nowMs) } },
      select: {
        capturedAt: true,
        memberCount: true,
        onlineCount: true,
        voiceCount: true,
        channelCount: true,
        boostCount: true,
      },
    }),
  ]);

  const series = (key: string): number[] =>
    aggregateAverageSeries(
      rows.map((row: Record<string, unknown>) => ({
        bucketStart: new Date(row.capturedAt as Date).getTime(),
        value: asNumber(row[key]),
      })),
      start.getTime(),
      nowMs,
      bucketMs,
    );

  const averages = {
    members: emptyTotals(),
    online: emptyTotals(),
    voice: emptyTotals(),
    channels: emptyTotals(),
    boosts: emptyTotals(),
  };
  for (const item of LookbackValues) {
    const since = rangeStart(item, nowMs).getTime();
    averages.members[item] = averageInWindow(
      allRows,
      "memberCount",
      since,
      nowMs,
    );
    averages.online[item] = averageInWindow(
      allRows,
      "onlineCount",
      since,
      nowMs,
    );
    averages.voice[item] = averageInWindow(allRows, "voiceCount", since, nowMs);
    averages.channels[item] = averageInWindow(
      allRows,
      "channelCount",
      since,
      nowMs,
    );
    averages.boosts[item] = averageInWindow(
      allRows,
      "boostCount",
      since,
      nowMs,
    );
  }

  return {
    latest: latest
      ? {
          memberCount: latest.memberCount,
          onlineCount: latest.onlineCount,
          idleCount: latest.idleCount,
          dndCount: latest.dndCount,
          offlineCount: latest.offlineCount,
          voiceCount: latest.voiceCount,
          channelCount: latest.channelCount,
          roleCount: latest.roleCount,
          boostCount: latest.boostCount,
          boostTier: latest.boostTier,
        }
      : null,
    memberSeries: series("memberCount"),
    onlineSeries: series("onlineCount"),
    idleSeries: series("idleCount"),
    dndSeries: series("dndCount"),
    offlineSeries: series("offlineCount"),
    voiceSeries: series("voiceCount"),
    channelSeries: series("channelCount"),
    boostSeries: series("boostCount"),
    bucketMs,
    start,
    end,
    averages,
  };
}

function timedValues(
  rows: ReadonlyArray<{ bucketStart: Date | string; value: number }>,
): Array<{ bucketStart: number; value: number }> {
  return rows.map((row) => ({
    bucketStart: new Date(row.bucketStart).getTime(),
    value: row.value,
  }));
}

function totalsByLookback(
  rows: ReadonlyArray<{ bucketStart: number; value: number }>,
  nowMs: number,
): TotalsByLookback {
  const totals = emptyTotals();
  for (const lookback of LookbackValues) {
    totals[lookback] = sumInWindow(
      rows,
      rangeStart(lookback, nowMs).getTime(),
      nowMs,
    );
  }
  return totals;
}

function channelTotalsInWindow(
  rows: ReadonlyArray<{
    bucketStart: number;
    channelId: string;
    value: number;
  }>,
  startMs: number,
  endMs: number,
): Counter[] {
  const values = new Map<string, number>();
  for (const row of rows) {
    if (row.bucketStart < startMs || row.bucketStart >= endMs) continue;
    values.set(row.channelId, (values.get(row.channelId) ?? 0) + row.value);
  }
  return topEntries(values, 5);
}

export async function loadUserStats(
  services: ModuleServices,
  guildId: string,
  userId: string,
  lookback: Lookback,
  nowMs: number = Date.now(),
): Promise<UserStats> {
  const prisma = prismaOf(services);
  const start60 = rangeStart("60d", nowMs);
  const start = rangeStart(lookback, nowMs);
  const bucketMs = chartBucketMs(lookback);

  const [messageRows, voiceRows, messageGroups, voiceGroups] =
    await Promise.all([
      prisma.statsMessageBucket.findMany({
        where: { guildId, userId, bucketStart: { gte: start60 } },
        select: { bucketStart: true, channelId: true, count: true },
      }),
      prisma.statsVoiceBucket.findMany({
        where: { guildId, userId, bucketStart: { gte: start60 } },
        select: { bucketStart: true, channelId: true, seconds: true },
      }),
      prisma.statsMessageBucket.groupBy({
        by: ["userId"],
        where: { guildId, bucketStart: { gte: start60 } },
        _sum: { count: true },
      }),
      prisma.statsVoiceBucket.groupBy({
        by: ["userId"],
        where: { guildId, bucketStart: { gte: start60 } },
        _sum: { seconds: true },
      }),
    ]);

  const messagesForTotals = messageRows.map(
    (row: { bucketStart: Date; count: number }) => ({
      bucketStart: new Date(row.bucketStart).getTime(),
      value: row.count,
    }),
  );
  const voiceForTotals = voiceRows.map(
    (row: { bucketStart: Date; seconds: number }) => ({
      bucketStart: new Date(row.bucketStart).getTime(),
      value: row.seconds,
    }),
  );
  const messagesForSeries = messageRows.map(
    (row: { bucketStart: Date; count: number }) => ({
      bucketStart: new Date(row.bucketStart).getTime(),
      value: row.count,
    }),
  );
  const voiceForSeries = voiceRows.map(
    (row: { bucketStart: Date; seconds: number }) => ({
      bucketStart: new Date(row.bucketStart).getTime(),
      value: row.seconds,
    }),
  );

  const messageChannels = channelTotalsInWindow(
    messageRows.map(
      (row: { bucketStart: Date; channelId: string; count: number }) => ({
        bucketStart: new Date(row.bucketStart).getTime(),
        channelId: row.channelId,
        value: row.count,
      }),
    ),
    start.getTime(),
    nowMs,
  );
  const voiceChannels = channelTotalsInWindow(
    voiceRows.map(
      (row: { bucketStart: Date; channelId: string; seconds: number }) => ({
        bucketStart: new Date(row.bucketStart).getTime(),
        channelId: row.channelId,
        value: row.seconds,
      }),
    ),
    start.getTime(),
    nowMs,
  );

  const messageRanks = new Map<string, number>();
  for (const group of messageGroups) {
    const sum = group._sum as { count?: unknown } | undefined;
    messageRanks.set(group.userId, asNumber(sum?.count));
  }
  const voiceRanks = new Map<string, number>();
  for (const group of voiceGroups) {
    const sum = group._sum as { seconds?: unknown } | undefined;
    voiceRanks.set(group.userId, asNumber(sum?.seconds));
  }
  const messageRank = rankOf(messageRanks, userId);
  const voiceRank = rankOf(voiceRanks, userId);

  return {
    userId,
    messages: totalsByLookback(messagesForTotals, nowMs),
    voice: totalsByLookback(voiceForTotals, nowMs),
    messageSeries: aggregateSeries(
      messagesForSeries,
      start.getTime(),
      nowMs,
      bucketMs,
    ),
    voiceSeries: aggregateSeries(
      voiceForSeries,
      start.getTime(),
      nowMs,
      bucketMs,
    ),
    topMessageChannels: messageChannels,
    topVoiceChannels: voiceChannels,
    messageRank: messageRank.rank,
    messageRankTotal: messageRank.total,
    voiceRank: voiceRank.rank,
    voiceRankTotal: voiceRank.total,
    bucketMs,
    start,
    end: new Date(nowMs),
  };
}

export async function loadTopStats(
  services: ModuleServices,
  guildId: string,
  type: TopType,
  lookback: Lookback,
  page: number,
  nowMs: number = Date.now(),
): Promise<TopStats> {
  const isMessage = type.startsWith("message");
  const isUser = type.endsWith("users");
  const stats = isMessage
    ? await loadMessageStats(services, guildId, lookback, nowMs)
    : await loadVoiceStats(services, guildId, lookback, nowMs);
  const source = isUser
    ? (stats as MessageStats | VoiceStats).byUser
    : (stats as MessageStats | VoiceStats).byChannel;
  const allEntries = topEntries(source, source.size);
  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil(allEntries.length / perPage));
  const currentPage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const entries = allEntries.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );

  return {
    type,
    entries,
    allEntries,
    page: currentPage,
    totalPages,
    total: allEntries.length,
    series: isMessage
      ? (stats as MessageStats).series
      : (stats as VoiceStats).series,
    bucketMs: stats.bucketMs,
    start: stats.start,
    end: stats.end,
  };
}

export { sampleSeries };
export { timedValues };
