import { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

export interface StatsSeriesPoint {
  bucketStart: number;
  value: number;
}

interface RawSeriesRow {
  bucket: Date | string;
  total: bigint | number | string;
}

export interface StatsSnapshotCounts {
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
}

function toNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export function createStatsHelpers(ctx: DbContext) {
  const { prisma } = ctx;

  async function groupedTotals(
    model: "statsMessageBucket" | "statsVoiceBucket",
    by: "userId" | "channelId",
    guildId: string,
    since: Date,
  ): Promise<Map<string, number>> {
    if (model === "statsMessageBucket") {
      const rows = await prisma.statsMessageBucket.groupBy({
        by: [by === "userId" ? "userId" : "channelId"],
        where: { guildId, bucketStart: { gte: since } },
        _sum: { count: true },
      });
      const map = new Map<string, number>();
      for (const row of rows) {
        const key = by === "userId" ? row.userId : row.channelId;
        map.set(key, toNumber(row._sum.count));
      }
      return map;
    }
    const rows = await prisma.statsVoiceBucket.groupBy({
      by: [by === "userId" ? "userId" : "channelId"],
      where: { guildId, bucketStart: { gte: since } },
      _sum: { seconds: true },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      const key = by === "userId" ? row.userId : row.channelId;
      map.set(key, toNumber(row._sum.seconds));
    }
    return map;
  }

  async function sliceSeries(
    table: "stats_message_buckets" | "stats_voice_buckets",
    column: "count" | "seconds",
    guildId: string,
    since: Date,
    bucketSeconds: number,
    filter?: { column: "user_id" | "channel_id"; value: string },
  ): Promise<StatsSeriesPoint[]> {
    const tableRef = Prisma.raw(
      table === "stats_message_buckets"
        ? "stats_message_buckets"
        : "stats_voice_buckets",
    );
    const columnRef = Prisma.raw(column);
    const filterClause = filter
      ? Prisma.sql`AND ${Prisma.raw(filter.column)} = ${filter.value}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<RawSeriesRow[]>(Prisma.sql`
      SELECT to_timestamp(floor(extract(epoch FROM bucket_start) / ${bucketSeconds}::numeric) * ${bucketSeconds}::numeric) AS bucket,
             SUM(${columnRef})::bigint AS total
      FROM ${tableRef}
      WHERE guild_id = ${guildId} AND bucket_start >= ${since} ${filterClause}
      GROUP BY 1 ORDER BY 1`);
    return rows.map((row) => ({
      bucketStart: new Date(row.bucket).getTime(),
      value: toNumber(row.total),
    }));
  }

  return {
    async upsertSnapshot(
      guildId: string,
      capturedAt: Date,
      counts: StatsSnapshotCounts,
    ) {
      await prisma.statsSnapshot.upsert({
        where: { guildId_capturedAt: { guildId, capturedAt } },
        create: { guildId, capturedAt, ...counts },
        update: counts,
      });
    },
    async upsertMessageBucket(
      guildId: string,
      channelId: string,
      userId: string,
      bucketStart: Date,
    ) {
      await prisma.statsMessageBucket.upsert({
        where: {
          guildId_channelId_userId_bucketStart: {
            guildId,
            channelId,
            userId,
            bucketStart,
          },
        },
        update: { count: { increment: 1 } },
        create: { guildId, channelId, userId, bucketStart, count: 1 },
      });
    },
    async upsertVoiceBucket(
      guildId: string,
      channelId: string,
      userId: string,
      bucketStart: Date,
      seconds: number,
    ) {
      await prisma.statsVoiceBucket.upsert({
        where: {
          guildId_channelId_userId_bucketStart: {
            guildId,
            channelId,
            userId,
            bucketStart,
          },
        },
        update: { seconds: { increment: seconds } },
        create: { guildId, channelId, userId, bucketStart, seconds },
      });
    },
    createEvent: (
      guildId: string,
      type: string,
      userId?: string,
      metadata?: unknown,
    ) =>
      prisma.statsEvent.create({
        data: {
          guildId,
          type,
          userId: userId ?? null,
          ...(metadata === undefined
            ? {}
            : { metadata: metadata as Prisma.InputJsonValue }),
        },
      }),
    async purgeBefore(cutoff: Date) {
      const [snapshots, messageBuckets, voiceBuckets, events] =
        await Promise.all([
          prisma.statsSnapshot.deleteMany({
            where: { capturedAt: { lt: cutoff } },
          }),
          prisma.statsMessageBucket.deleteMany({
            where: { bucketStart: { lt: cutoff } },
          }),
          prisma.statsVoiceBucket.deleteMany({
            where: { bucketStart: { lt: cutoff } },
          }),
          prisma.statsEvent.deleteMany({
            where: { createdAt: { lt: cutoff } },
          }),
        ]);
      return {
        snapshots: snapshots.count,
        messageBuckets: messageBuckets.count,
        voiceBuckets: voiceBuckets.count,
        events: events.count,
      };
    },
    messageSeries: (
      guildId: string,
      since: Date,
      bucketSeconds: number,
      filter?: { column: "user_id" | "channel_id"; value: string },
    ) =>
      sliceSeries(
        "stats_message_buckets",
        "count",
        guildId,
        since,
        bucketSeconds,
        filter,
      ),
    voiceSeries: (
      guildId: string,
      since: Date,
      bucketSeconds: number,
      filter?: { column: "user_id" | "channel_id"; value: string },
    ) =>
      sliceSeries(
        "stats_voice_buckets",
        "seconds",
        guildId,
        since,
        bucketSeconds,
        filter,
      ),
    async sumMessages(guildId: string, since: Date) {
      const result = await prisma.statsMessageBucket.aggregate({
        where: { guildId, bucketStart: { gte: since } },
        _sum: { count: true },
      });
      return toNumber(result._sum.count);
    },
    async sumVoiceSeconds(guildId: string, since: Date) {
      const result = await prisma.statsVoiceBucket.aggregate({
        where: { guildId, bucketStart: { gte: since } },
        _sum: { seconds: true },
      });
      return toNumber(result._sum.seconds);
    },
    messageTotalsByUser: (guildId: string, since: Date) =>
      groupedTotals("statsMessageBucket", "userId", guildId, since),
    messageTotalsByChannel: (guildId: string, since: Date) =>
      groupedTotals("statsMessageBucket", "channelId", guildId, since),
    voiceTotalsByUser: (guildId: string, since: Date) =>
      groupedTotals("statsVoiceBucket", "userId", guildId, since),
    voiceTotalsByChannel: (guildId: string, since: Date) =>
      groupedTotals("statsVoiceBucket", "channelId", guildId, since),
    listEvents: (guildId: string, since: Date) =>
      prisma.statsEvent.findMany({
        where: { guildId, createdAt: { gte: since } },
        select: { type: true, createdAt: true },
      }),
    findLatestSnapshot: (guildId: string) =>
      prisma.statsSnapshot.findFirst({
        where: { guildId },
        orderBy: { capturedAt: "desc" },
      }),
    findSnapshotsSince: (guildId: string, since: Date) =>
      prisma.statsSnapshot.findMany({
        where: { guildId, capturedAt: { gte: since } },
        orderBy: { capturedAt: "asc" },
      }),
    findSnapshotSummarySince: (guildId: string, since: Date) =>
      prisma.statsSnapshot.findMany({
        where: { guildId, capturedAt: { gte: since } },
        select: {
          capturedAt: true,
          memberCount: true,
          onlineCount: true,
          voiceCount: true,
          channelCount: true,
          boostCount: true,
        },
      }),
    findMessageBucketsForUser: (guildId: string, userId: string, since: Date) =>
      prisma.statsMessageBucket.findMany({
        where: { guildId, userId, bucketStart: { gte: since } },
        select: { bucketStart: true, channelId: true, count: true },
      }),
    findVoiceBucketsForUser: (guildId: string, userId: string, since: Date) =>
      prisma.statsVoiceBucket.findMany({
        where: { guildId, userId, bucketStart: { gte: since } },
        select: { bucketStart: true, channelId: true, seconds: true },
      }),
    listEventsForUser: (guildId: string, userId: string) =>
      prisma.statsEvent.findMany({
        where: { guildId, userId },
        orderBy: { createdAt: "asc" },
      }),
    async deleteUserData(guildId: string, userId: string) {
      const [messageBuckets, voiceBuckets, events] = await prisma.$transaction([
        prisma.statsMessageBucket.deleteMany({ where: { guildId, userId } }),
        prisma.statsVoiceBucket.deleteMany({ where: { guildId, userId } }),
        prisma.statsEvent.deleteMany({ where: { guildId, userId } }),
      ]);
      return {
        messageBuckets: messageBuckets.count,
        voiceBuckets: voiceBuckets.count,
        events: events.count,
      };
    },
  };
}
